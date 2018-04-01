import {
  JSONRPC,
  JSONRPCID,
  JSONRPCParams,
  JSONRPCRequest,
  JSONRPCResponse
} from "./models";

export type SendRequest<ClientParams> = (
  request: JSONRPCRequest
) => PromiseLike<void> | ((clientParams?: ClientParams) => PromiseLike<void>);
export type CreateID = () => JSONRPCID;

type Resolve = (response: JSONRPCResponse) => void;

type IDToDeferredMap = Map<JSONRPCID, Resolve>;

export class JSONRPCClient<ClientParams = void> {
  private idToResolveMap: IDToDeferredMap;
  private id: number;

  constructor(
    private sendRequest: SendRequest<ClientParams>,
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
    return this._sendRequest(request, clientParams).then(() => promise);
  }

  notify(
    method: string,
    params?: JSONRPCParams,
    clientParams?: ClientParams
  ): void {
    this._sendRequest(
      {
        jsonrpc: JSONRPC,
        method,
        params
      },
      clientParams
    );
  }

  private _sendRequest(
    request: JSONRPCRequest,
    clientParams: ClientParams | undefined
  ): PromiseLike<void> {
    let response = this.sendRequest(request);
    if (typeof response === "function") {
      response = response(clientParams);
    }
    return response;
  }

  receive(response: JSONRPCResponse): void {
    const resolve = this.idToResolveMap.get(response.id);
    if (resolve) {
      resolve(response);
    }
  }
}
