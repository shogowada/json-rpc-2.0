import {
  createJSONRPCErrorResponse,
  JSONRPC,
  JSONRPCErrorCode,
  JSONRPCID,
  JSONRPCParams,
  JSONRPCRequest,
  JSONRPCResponse
} from "./models";

export type SendRequest<ClientParams> = (
  payload: any
) => PromiseLike<void> | ((clientParams?: ClientParams) => PromiseLike<void>);
export type CreateID = () => JSONRPCID;

type Resolve = (response: JSONRPCResponse) => void;

type IDToDeferredMap = Map<JSONRPCID, Resolve>;

export class JSONRPCClient<ClientParams = void> {
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

  request(
    method: string,
    params?: JSONRPCParams,
    clientParams?: ClientParams
  ): PromiseLike<any> {
    const request: JSONRPCRequest = {
      jsonrpc: JSONRPC,
      method,
      params,
      id: this._createID()
    };

    return this.requestAdvanced(request, clientParams).then(response => {
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
  ): PromiseLike<JSONRPCResponse> {
    const promise: PromiseLike<JSONRPCResponse> = new Promise(resolve =>
      this.idToResolveMap.set(request.id!, resolve)
    );
    return this.send(request, clientParams).then(
      () => promise,
      error => {
        this.receive(
          createJSONRPCErrorResponse(
            request.id!,
            0,
            (error && error.message) || "Failed to send a request"
          )
        );
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
        params
      },
      clientParams
    ).then(undefined, () => undefined);
  }

  send(
    payload: any,
    clientParams: ClientParams | undefined
  ): PromiseLike<void> {
    let promiseOrFunction = this._send(payload);
    if (typeof promiseOrFunction === "function") {
      promiseOrFunction = promiseOrFunction(clientParams);
    }
    return promiseOrFunction;
  }

  rejectAllPendingRequests(message: string): void {
    this.idToResolveMap.forEach((resolve: Resolve, id: string) =>
      resolve(createJSONRPCErrorResponse(id, 0, message))
    );
    this.idToResolveMap.clear();
  }

  receive(response: JSONRPCResponse): void {
    const resolve = this.idToResolveMap.get(response.id);
    if (resolve) {
      this.idToResolveMap.delete(response.id);
      resolve(response);
    }
  }
}
