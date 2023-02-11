import type { JSONRPCClient } from "./client";
import type { JSONRPCServer } from "./server";
import type { JSONRPCServerAndClient } from "./server-and-client";

type MethodsType = Record<string, (params?: any) => any>;

export interface TypedJSONRPCClient<
  Methods extends MethodsType,
  ClientParams = void
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
  ServerParams = void
> extends JSONRPCServer<ServerParams> {
  addMethod<Method extends Extract<keyof Methods, string>>(
    name: Method,
    method: (
      params: Parameters<Methods[Method]>[0],
      serverParams: ServerParams
    ) => ReturnType<Methods[Method]> | PromiseLike<ReturnType<Methods[Method]>>
  ): void;
}

export interface TypedJSONRPCServerAndClient<
  Methods extends MethodsType,
  ClientParams = void,
  ServerParams = void
> extends JSONRPCServerAndClient<ServerParams, ClientParams> {
  request<Method extends Extract<keyof Methods, string>>(
    method: Method,
    ...args: Parameters<Methods[Method]>[0] extends undefined
      ? [void, ClientParams]
      : [Parameters<Methods[Method]>[0], ClientParams]
  ): PromiseLike<ReturnType<Methods[Method]>>;

  addMethod<Method extends Extract<keyof Methods, string>>(
    name: Method,
    method: (
      params: Parameters<Methods[Method]>[0],
      serverParams: ServerParams
    ) => ReturnType<Methods[Method]> | PromiseLike<ReturnType<Methods[Method]>>
  ): void;
}
