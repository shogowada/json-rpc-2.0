import {
  createJSONRPCErrorResponse,
  JSONRPC,
  JSONRPCErrorCode,
  JSONRPCID,
  JSONRPCParams,
  JSONRPCRequest,
  JSONRPCResponse,
} from "./models";

export type SendRequest<ClientParams> = (
  payload: any,
  clientParams?: ClientParams
) => PromiseLike<void>;

export type CreateID = () => JSONRPCID;

type Resolve = (response: JSONRPCResponse) => void;

type IDToDeferredMap = Map<JSONRPCID, Resolve>;

export class JSONRPCRemoteError extends Error {
  constructor(
    message: string,
    readonly code: number,
    readonly response?: JSONRPCResponse,
    readonly data?: any
  ) {
    super(message);
  }
}

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

  async request(
    method: string,
    params?: JSONRPCParams,
    clientParams?: ClientParams
  ): Promise<any> {
    const request: JSONRPCRequest = {
      jsonrpc: JSONRPC,
      method,
      params,
      id: this._createID(),
    };

    const response = await this.requestAdvanced(request, clientParams);
    if (response.result !== undefined && !response.error) {
      return response.result;
    } else if (response.result === undefined && response.error) {
      throw new JSONRPCRemoteError(
        response.error.message,
        response.error.code,
        response,
        response.error.data
      );
    } else {
      throw new Error("An unexpected error occurred");
    }
  }

  async requestAdvanced(
    request: JSONRPCRequest,
    clientParams?: ClientParams
  ): Promise<JSONRPCResponse> {
    const promise: PromiseLike<JSONRPCResponse> = new Promise((resolve) =>
      this.idToResolveMap.set(request.id!, resolve)
    );

    try {
      await this.send(request, clientParams);
    } catch (error) {
      this.receive(
        createJSONRPCErrorResponse(
          request.id!,
          0,
          (error && error.message) || "Failed to send a request"
        )
      );
    }

    return promise;
  }

  async notify(
    method: string,
    params?: JSONRPCParams,
    clientParams?: ClientParams
  ): Promise<void> {
    await this.send(
      {
        jsonrpc: JSONRPC,
        method,
        params,
      },
      clientParams as ClientParams
    );
  }

  send(payload: any, clientParams?: ClientParams): PromiseLike<void> {
    return this._send(payload, clientParams);
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
