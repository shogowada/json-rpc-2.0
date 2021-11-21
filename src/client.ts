import {
  createJSONRPCErrorResponse,
  JSONRPC,
  JSONRPCErrorResponse,
  JSONRPCID,
  JSONRPCParams,
  JSONRPCRequest,
  JSONRPCResponse,
} from "./models";
import { createLogDeprecationWarning, DefaultErrorCode } from "./internal";

export type SendRequest<ClientParams> = (
  payload: any,
  clientParams: ClientParams | undefined
) => PromiseLike<void> | ((clientParams?: ClientParams) => PromiseLike<void>);
export type CreateID = () => JSONRPCID;

type Resolve = (response: JSONRPCResponse) => void;

type IDToDeferredMap = Map<JSONRPCID, Resolve>;

const logHigherOrderFunctionDeprecationWarning = createLogDeprecationWarning(
  `Using a higher order function on JSONRPCClient send method is deprecated.
Instead of this: new JSONRPCClient((jsonRPCClient) => (clientParams) => /* no change here */)
Do this:         new JSONRPCClient((jsonRPCClient, clientParams) => /* no change here */)
The old way still works, but we will drop the support in the future.`
);

export interface JSONRPCRequester<ClientParams> {
  request: (
    method: string,
    params?: JSONRPCParams,
    clientParams?: ClientParams
  ) => PromiseLike<any>;
  requestAdvanced: (
    request: JSONRPCRequest,
    clientParams?: ClientParams
  ) => PromiseLike<JSONRPCResponse>;
}

export class JSONRPCClient<ClientParams = void>
  implements JSONRPCRequester<ClientParams>
{
  private idToResolveMap: IDToDeferredMap;
  private id: number;

  constructor(
    private _send: SendRequest<ClientParams>,
    private createID?: CreateID
  ) {
    this.idToResolveMap = new Map();
    this.id = 0;
  }

  private _createID(): JSONRPCID {
    if (this.createID) {
      return this.createID();
    } else {
      return ++this.id;
    }
  }

  timeout(
    delay: number,
    overrideCreateJSONRPCErrorResponse: (
      id: JSONRPCID
    ) => JSONRPCErrorResponse = (id: JSONRPCID): JSONRPCErrorResponse =>
      createJSONRPCErrorResponse(id, DefaultErrorCode, "Request timeout")
  ): JSONRPCRequester<ClientParams> {
    const timeoutRequest = (id: JSONRPCID, request: () => PromiseLike<any>) => {
      const timeoutID = setTimeout(() => {
        const resolve: Resolve | undefined = this.idToResolveMap.get(id);
        if (resolve) {
          this.idToResolveMap.delete(id);
          resolve(overrideCreateJSONRPCErrorResponse(id));
        }
      }, delay);

      return request().then(
        (result) => {
          clearTimeout(timeoutID);
          return result;
        },
        (error) => {
          clearTimeout(timeoutID);
          return Promise.reject(error);
        }
      );
    };

    return {
      request: (
        method: string,
        params?: JSONRPCParams,
        clientParams?: ClientParams
      ): PromiseLike<any> => {
        const id: JSONRPCID = this._createID();
        return timeoutRequest(id, () =>
          this.requestWithID(method, params, clientParams, id)
        );
      },
      requestAdvanced: (
        request: JSONRPCRequest,
        clientParams?: ClientParams
      ): PromiseLike<JSONRPCResponse> => {
        return timeoutRequest(request.id!, () =>
          this.requestAdvanced(request, clientParams)
        );
      },
    };
  }

  request(
    method: string,
    params?: JSONRPCParams,
    clientParams?: ClientParams
  ): PromiseLike<any> {
    return this.requestWithID(method, params, clientParams, this._createID());
  }

  private requestWithID(
    method: string,
    params: JSONRPCParams | undefined,
    clientParams: ClientParams | undefined,
    id: JSONRPCID
  ): PromiseLike<any> {
    const request: JSONRPCRequest = {
      jsonrpc: JSONRPC,
      method,
      params,
      id,
    };

    return this.requestAdvanced(request, clientParams).then((response) => {
      if (response.result !== undefined && !response.error) {
        return response.result;
      } else if (response.result === undefined && response.error) {
        return Promise.reject(new Error(response.error.message));
      } else {
        return Promise.reject(new Error("An unexpected error occurred"));
      }
    });
  }

  requestAdvanced(
    request: JSONRPCRequest,
    clientParams?: ClientParams
  ): PromiseLike<JSONRPCResponse>;
  requestAdvanced(
    request: JSONRPCRequest[],
    clientParams?: ClientParams
  ): PromiseLike<JSONRPCResponse[]>;
  requestAdvanced(
    requests: JSONRPCRequest | JSONRPCRequest[],
    clientParams?: ClientParams
  ): PromiseLike<JSONRPCResponse | JSONRPCResponse[]> {
    const areRequestsOriginallyArray = Array.isArray(requests);
    if (!Array.isArray(requests)) {
      requests = [requests];
    }

    const requestsWithID: JSONRPCRequest[] = requests.filter((request) =>
      isDefinedAndNonNull(request.id)
    );

    const promises: PromiseLike<JSONRPCResponse>[] = requestsWithID.map(
      (request) =>
        new Promise((resolve) => this.idToResolveMap.set(request.id!, resolve))
    );

    const promise: PromiseLike<JSONRPCResponse | JSONRPCResponse[]> =
      Promise.all(promises).then((responses: JSONRPCResponse[]) => {
        if (areRequestsOriginallyArray || !responses.length) {
          return responses;
        } else {
          return responses[0];
        }
      });

    return this.send(
      areRequestsOriginallyArray ? requests : requests[0],
      clientParams
    ).then(
      () => promise,
      (error) => {
        requestsWithID.forEach((request) => {
          this.receive(
            createJSONRPCErrorResponse(
              request.id!,
              DefaultErrorCode,
              (error && error.message) || "Failed to send a request"
            )
          );
        });
        return promise;
      }
    );
  }

  notify(
    method: string,
    params?: JSONRPCParams,
    clientParams?: ClientParams
  ): void {
    this.send(
      {
        jsonrpc: JSONRPC,
        method,
        params,
      },
      clientParams
    ).then(undefined, () => undefined);
  }

  send(
    payload: any,
    clientParams: ClientParams | undefined
  ): PromiseLike<void> {
    let promiseOrFunction = this._send(payload, clientParams);
    if (typeof promiseOrFunction === "function") {
      logHigherOrderFunctionDeprecationWarning();
      promiseOrFunction = promiseOrFunction(clientParams);
    }
    return promiseOrFunction;
  }

  rejectAllPendingRequests(message: string): void {
    this.idToResolveMap.forEach((resolve: Resolve, id: string) =>
      resolve(createJSONRPCErrorResponse(id, DefaultErrorCode, message))
    );
    this.idToResolveMap.clear();
  }

  receive(responses: JSONRPCResponse | JSONRPCResponse[]): void {
    if (!Array.isArray(responses)) {
      responses = [responses];
    }

    responses.forEach((response) => {
      const resolve = this.idToResolveMap.get(response.id);
      if (resolve) {
        this.idToResolveMap.delete(response.id);
        resolve(response);
      }
    });
  }
}

const isDefinedAndNonNull = <T>(value: T | null | undefined): value is T =>
  value !== undefined && value !== null;
