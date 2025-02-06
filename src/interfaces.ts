import type { JSONRPCClient } from "./client.js";
import type { JSONRPCServer } from "./server.js";
import type { JSONRPCServerAndClient } from "./server-and-client.js";

type MethodsType = Record<string, (params?: any) => any>;

export interface TypedJSONRPCClient<
  Methods extends MethodsType,
  ClientParams = void,
> extends JSONRPCClient<ClientParams> {
  request<Method extends Extract<keyof Methods, string>>(
    method: Method,
    ...args: Parameters<Methods[Method]>[0] extends undefined
      ? [void, ClientParams]
      : [Parameters<Methods[Method]>[0], ClientParams]
  ): PromiseLike<ReturnType<Methods[Method]>>;
}

export interface TypedJSONRPCServer<
  Methods extends MethodsType,
  ServerParams = void,
> extends JSONRPCServer<ServerParams> {
  addMethod<Method extends Extract<keyof Methods, string>>(
    name: Method,
    method: (
      params: Parameters<Methods[Method]>[0],
      serverParams: ServerParams,
    ) => ReturnType<Methods[Method]> | PromiseLike<ReturnType<Methods[Method]>>,
  ): void;
}

export interface TypedJSONRPCServerAndClient<
  ServerMethods extends MethodsType,
  ClientMethods extends MethodsType,
  ServerParams = void,
  ClientParams = void,
> extends JSONRPCServerAndClient<ServerParams, ClientParams> {
  request<Method extends Extract<keyof ClientMethods, string>>(
    method: Method,
    ...args: Parameters<ClientMethods[Method]>[0] extends undefined
      ? [void, ClientParams]
      : [Parameters<ClientMethods[Method]>[0], ClientParams]
  ): PromiseLike<ReturnType<ClientMethods[Method]>>;

  addMethod<Method extends Extract<keyof ServerMethods, string>>(
    name: Method,
    method: (
      params: Parameters<ServerMethods[Method]>[0],
      serverParams: ServerParams,
    ) =>
      | ReturnType<ServerMethods[Method]>
      | PromiseLike<ReturnType<ServerMethods[Method]>>,
  ): void;
}
