import { JSONRPCMethod, JSONRPCServer, SimpleJSONRPCMethod } from "./server";
import { JSONRPCClient } from "./client";
import {
  isJSONRPCRequest,
  isJSONRPCResponse,
  JSONRPCParams,
  JSONRPCRequest,
  JSONRPCResponse,
} from "./models";

export class JSONRPCServerAndClient<ServerParams = void, ClientParams = void> {
  constructor(
    public server: JSONRPCServer<ServerParams>,
    public client: JSONRPCClient<ClientParams>
  ) {}

  addMethod(name: string, method: SimpleJSONRPCMethod<ServerParams>): void {
    this.server.addMethod(name, method);
  }

  addMethodAdvanced(name: string, method: JSONRPCMethod<ServerParams>): void {
    this.server.addMethodAdvanced(name, method);
  }

  request(
    method: string,
    params?: JSONRPCParams,
    clientParams?: ClientParams
  ): PromiseLike<any> {
    return this.client.request(method, params, clientParams);
  }

  requestAdvanced(
    jsonRPCRequest: JSONRPCRequest,
    clientParams?: ClientParams
  ): PromiseLike<JSONRPCResponse> {
    return this.client.requestAdvanced(jsonRPCRequest, clientParams);
  }

  notify(
    method: string,
    params?: JSONRPCParams,
    clientParams?: ClientParams
  ): void {
    this.client.notify(method, params, clientParams);
  }

  rejectAllPendingRequests(message: string): void {
    this.client.rejectAllPendingRequests(message);
  }

  async receiveAndSend(
    payload: any,
    serverParams?: ServerParams,
    clientParams?: ClientParams
  ): Promise<void> {
    if (isJSONRPCResponse(payload)) {
      this.client.receive(payload);
    } else if (isJSONRPCRequest(payload)) {
      const response: JSONRPCResponse | null = await this.server.receive(
        payload,
        serverParams
      );
      if (response) {
        return this.client.send(response, clientParams);
      }
    } else {
      const message = "Received an invalid JSON-RPC message";
      console.warn(message, payload);
      return Promise.reject(new Error(message));
    }
  }
}
