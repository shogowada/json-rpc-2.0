import { JSONRPCServer, SimpleJSONRPCMethod } from "./server";
import { JSONRPCClient } from "./client";
import { JSONRPCParams, JSONRPCRequest, JSONRPCResponse } from "./models";

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

  async receiveAndSend(
    requestOrResponse: object,
    serverParams?: ServerParams,
    clientParams?: ClientParams
  ): Promise<void> {
    if (!this.client.receive(requestOrResponse as JSONRPCResponse)) {
      const response: JSONRPCResponse | null = await this.server.receive(
        requestOrResponse as JSONRPCRequest,
        serverParams
      );
      if (response) {
        return this.client.sendToServer(response, clientParams);
      }
    }
  }
}
