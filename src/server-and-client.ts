import { JSONRPCServer, SimpleJSONRPCMethod } from "./server";
import { JSONRPCClient } from "./client";
import {
  isJSONRPCRequest,
  isJSONRPCResponse,
  JSONRPCParams,
  JSONRPCRequest,
  JSONRPCResponse
} from "./models";

export class JSONRPCServerAndClient<ServerParams = void, ClientParams = void> {
  constructor(
    private server: JSONRPCServer<ServerParams>,
    private client: JSONRPCClient<ClientParams>
  ) {}

  addMethod(name: string, method: SimpleJSONRPCMethod): void {
    this.server.addMethod(name, method);
  }

  request(
    method: string,
    params?: JSONRPCParams,
    clientParams?: ClientParams
  ): PromiseLike<any> {
    return this.client.request(method, params, clientParams);
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
    }
  }
}
