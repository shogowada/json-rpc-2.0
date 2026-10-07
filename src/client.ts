import {
  createJSONRPCErrorResponse,
  createJSONRPCRequest,
  createJSONRPCNotification,
  JSONRPCErrorException,
  JSONRPCErrorResponse,
  JSONRPCID,
  JSONRPCParams,
  JSONRPCRequest,
  JSONRPCResponse,
} from "./models";
import { DefaultErrorCode } from "./internal";

export type SendRequest<ClientParams> = (
  payload: any,
  clientParams: ClientParams,
  abortSignal?: AbortSignal
) => PromiseLike<void> | void;
export type CreateID = () => JSONRPCID;

type Resolve = (response: JSONRPCResponse) => void;

type IDToDeferredMap = Map<JSONRPCID, Resolve>;

export interface JSONRPCRequester<ClientParams> {
  request(
    method: string,
    params?: JSONRPCParams,
    clientParams?: ClientParams,
    abortController?: AbortController
  ): PromiseLike<any>;
  requestAdvanced(
    request: JSONRPCRequest,
    clientParams?: ClientParams,
    abortController?: AbortController
  ): PromiseLike<JSONRPCResponse>;
  requestAdvanced(
    request: JSONRPCRequest[],
    clientParams?: ClientParams,
    abortController?: AbortController
  ): PromiseLike<JSONRPCResponse[]>;
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
    const timeoutRequest = (
      ids: JSONRPCID[],
      request: () => PromiseLike<any>,
      abortController: AbortController
    ) => {
      const timeoutID = setTimeout(() => {
        ids.forEach((id) => {
          const resolve: Resolve | undefined = this.idToResolveMap.get(id);
          if (resolve) {
            this.idToResolveMap.delete(id);
            const errResp = overrideCreateJSONRPCErrorResponse(id);
            abortController.abort(errResp);
            resolve(errResp);
          }
        });
      }, delay);

      // The 'abort' event is not supported by:
      // - browsers < 2018
      // - nodejs < 14.17
      // @ts-ignore
      abortController.signal.addEventListener?.(
        "abort",
        () => clearTimeout(timeoutID),
        { once: true }
      );

      return request().then(
        (result) => {
          clearTimeout(timeoutID);
          if (abortController.signal.aborted) {
            // If result already has an error (timeout fired and resolved via the map),
            // return it as-is rather than replacing with a generic abort error.
            if (result && typeof result === "object" && "error" in result) {
              return result;
            }
            const error =
              typeof abortController.signal.reason === "string"
                ? abortController.signal.reason
                : "Aborted";
            return Promise.reject(
              new JSONRPCErrorException(error, DefaultErrorCode)
            );
          }
          return result;
        },
        (error) => {
          clearTimeout(timeoutID);
          return Promise.reject(error);
        }
      );
    };

    const requestAdvanced = (
      request: JSONRPCRequest | JSONRPCRequest[],
      clientParams: ClientParams,
      abortController?: AbortController
    ): PromiseLike<JSONRPCResponse | JSONRPCResponse[]> => {
      const ids: JSONRPCID[] = (!Array.isArray(request) ? [request] : request)
        .map((request) => request.id)
        .filter(isDefinedAndNonNull);

      const abortControllerRef = abortController ?? new AbortController();
      return timeoutRequest(
        ids,
        () =>
          this.requestAdvanced(
            request as any,
            clientParams,
            abortControllerRef
          ),
        abortControllerRef
      );
    };

    return {
      request: (
        method: string,
        params: JSONRPCParams,
        clientParams: ClientParams,
        abortController?: AbortController
      ): PromiseLike<any> => {
        const id: JSONRPCID = this._createID();
        const abortControllerRef = abortController ?? new AbortController();
        return timeoutRequest(
          [id],
          () =>
            this.requestWithID(
              method,
              params,
              clientParams,
              id,
              abortControllerRef
            ),
          abortControllerRef
        );
      },
      requestAdvanced: (
        request: JSONRPCRequest | JSONRPCRequest[],
        clientParams: ClientParams,
        abortController?: AbortController
      ): PromiseLike<any> => {
        return requestAdvanced(request, clientParams, abortController);
      },
    };
  }

  request(
    method: string,
    params: JSONRPCParams,
    clientParams: ClientParams,
    abortController?: AbortController
  ): PromiseLike<any> {
    return this.requestWithID(
      method,
      params,
      clientParams,
      this._createID(),
      abortController
    );
  }

  private async requestWithID(
    method: string,
    params: JSONRPCParams | undefined,
    clientParams: ClientParams,
    id: JSONRPCID,
    abortController?: AbortController
  ): Promise<any> {
    const request: JSONRPCRequest = createJSONRPCRequest(id, method, params);

    const response: JSONRPCResponse = await this.requestAdvanced(
      request,
      clientParams,
      abortController
    );
    if (response.result !== undefined && !response.error) {
      return response.result;
    } else if (response.result === undefined && response.error) {
      return Promise.reject(
        new JSONRPCErrorException(
          response.error.message,
          response.error.code,
          response.error.data
        )
      );
    } else {
      return Promise.reject(new Error("An unexpected error occurred"));
    }
  }

  requestAdvanced(
    request: JSONRPCRequest,
    clientParams: ClientParams,
    abortController?: AbortController
  ): PromiseLike<JSONRPCResponse>;
  requestAdvanced(
    request: JSONRPCRequest[],
    clientParams: ClientParams,
    abortController?: AbortController
  ): PromiseLike<JSONRPCResponse[]>;
  requestAdvanced(
    requests: JSONRPCRequest | JSONRPCRequest[],
    clientParams: ClientParams,
    abortController?: AbortController
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
      clientParams,
      abortController?.signal
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
    params: JSONRPCParams,
    clientParams: ClientParams,
    abortSignal?: AbortSignal
  ): void {
    const request: JSONRPCRequest = createJSONRPCNotification(method, params);
    void this.send(request, clientParams, abortSignal);
  }

  async send(
    payload: any,
    clientParams: ClientParams,
    abortSignal?: AbortSignal
  ): Promise<void> {
    return this._send(payload, clientParams, abortSignal);
  }

  rejectAllPendingRequests(message: string): void {
    this.idToResolveMap.forEach((resolve: Resolve, id: JSONRPCID) =>
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
