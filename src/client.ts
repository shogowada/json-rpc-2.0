import {
  JSONRPC,
  JSONRPCID,
  JSONRPCParams,
  JSONRPCRequest,
  JSONRPCResponse
} from "./models";

export type CreateID = () => JSONRPCID;
export type SendRequest = (request: JSONRPCRequest) => PromiseLike<void>;

type Resolve = (response: JSONRPCResponse) => void;

type IDToDeferredMap = Map<JSONRPCID, Resolve>;

export class JSONRPCClient {
  private idToResolveMap: IDToDeferredMap;

  constructor(private createID: CreateID, private sendRequest: SendRequest) {
    this.idToResolveMap = new Map();
  }

  request(method: string, params?: JSONRPCParams): PromiseLike<any> {
    const request: JSONRPCRequest = {
      jsonrpc: JSONRPC,
      method,
      params,
      id: this.createID()
    };

    return this.requestAdvanced(request).then(response => {
      if (response.result && !response.error) {
        return response.result;
      } else if (!response.result && response.error) {
        return Promise.reject(new Error(response.error.message));
      } else {
        return Promise.reject(new Error("An unexpected error occurred"));
      }
    });
  }

  requestAdvanced(request: JSONRPCRequest): PromiseLike<JSONRPCResponse> {
    const promise: PromiseLike<JSONRPCResponse> = new Promise(resolve =>
      this.idToResolveMap.set(request.id!, resolve)
    );
    return this.sendRequest(request).then(() => promise);
  }

  notify(method: string, params?: JSONRPCParams): void {
    this.sendRequest({
      jsonrpc: JSONRPC,
      method,
      params
    });
  }

  receive(response: JSONRPCResponse): void {
    const resolve = this.idToResolveMap.get(response.id);
    if (resolve) {
      resolve(response);
    }
  }
}
