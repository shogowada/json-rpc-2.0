import {
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCParams,
  JSONRPC,
  JSONRPCID,
  JSONRPCErrorCode,
  createJSONRPCErrorResponse,
  isJSONRPCRequest,
} from "./models";
import { createLogDeprecationWarning } from "./internal";

export type SimpleJSONRPCMethod<ServerParams = void> = (
  params: Partial<JSONRPCParams> | undefined,
  serverParams: ServerParams | undefined
) => any;
export type JSONRPCMethod<ServerParams = void> = (
  request: JSONRPCRequest,
  serverParams: ServerParams | undefined
) =>
  | JSONRPCResponsePromise
  | ((serverParams: ServerParams | undefined) => JSONRPCResponsePromise);
export type JSONRPCResponsePromise = PromiseLike<JSONRPCResponse | null>;

type NameToMethodDictionary<ServerParams> = {
  [name: string]: JSONRPCMethod<ServerParams>;
};

const DefaultErrorCode = 0;

const createMethodNotFoundResponse = (id: JSONRPCID): JSONRPCResponse =>
  createJSONRPCErrorResponse(
    id,
    JSONRPCErrorCode.MethodNotFound,
    "Method not found"
  );

const logHigherOrderFunctionDeprecationWarning = createLogDeprecationWarning(
  `Using a higher order function on JSONRPCServer.addMethod/addMethodAdvanced is deprecated.
Instead of this: jsonRPCServer.addMethod(methodName, (params) => (serverParams) => /* no change here */)
Do this:         jsonRPCServer.addMethod(methodName, (params, serverParams) => /* no change here */)
The old way still works, but we will drop the support in the future.`
);

export class JSONRPCServer<ServerParams = void> {
  private nameToMethodDictionary: NameToMethodDictionary<ServerParams>;

  constructor() {
    this.nameToMethodDictionary = {};
  }

  addMethod(name: string, method: SimpleJSONRPCMethod<ServerParams>): void {
    this.addMethodAdvanced(name, this.toJSONRPCMethod(method));
  }

  private toJSONRPCMethod(
    method: SimpleJSONRPCMethod<ServerParams>
  ): JSONRPCMethod<ServerParams> {
    return (
      request: JSONRPCRequest,
      serverParams: ServerParams
    ): JSONRPCResponsePromise => {
      let response = method(request.params, serverParams);
      if (typeof response === "function") {
        logHigherOrderFunctionDeprecationWarning();
        response = response(serverParams);
      }
      return Promise.resolve(response).then(
        (result: any) => mapResultToJSONRPCResponse(request.id, result),
        (error: any) => {
          console.warn(
            `JSON-RPC method ${request.method} responded an error`,
            error
          );
          return mapErrorToJSONRPCResponse(request.id, error);
        }
      );
    };
  }

  addMethodAdvanced(name: string, method: JSONRPCMethod<ServerParams>): void {
    this.nameToMethodDictionary = {
      ...this.nameToMethodDictionary,
      [name]: method,
    };
  }

  receive(
    request: JSONRPCRequest,
    serverParams?: ServerParams
  ): JSONRPCResponsePromise {
    const method = this.nameToMethodDictionary[request.method];

    if (!isJSONRPCRequest(request)) {
      const message = "Received an invalid JSON-RPC request";
      console.warn(message, request);
      return Promise.reject(new Error(message));
    } else if (method) {
      const response: JSONRPCResponsePromise = this.callMethod(
        method,
        request,
        serverParams
      );
      return response.then((response) => mapResponse(request, response));
    } else if (request.id !== undefined) {
      return Promise.resolve(createMethodNotFoundResponse(request.id));
    } else {
      return Promise.resolve(null);
    }
  }

  private callMethod(
    method: JSONRPCMethod<ServerParams>,
    request: JSONRPCRequest,
    serverParams: ServerParams | undefined
  ): JSONRPCResponsePromise {
    const onError = (error: any): JSONRPCResponsePromise => {
      console.warn(
        `An unexpected error occurred while executing "${request.method}" JSON-RPC method:`,
        error
      );
      return Promise.resolve(mapErrorToJSONRPCResponse(request.id, error));
    };

    try {
      let response = method(request, serverParams);
      if (typeof response === "function") {
        logHigherOrderFunctionDeprecationWarning();
        response = response(serverParams);
      }
      return response.then(undefined, onError);
    } catch (error) {
      return onError(error);
    }
  }
}

const mapResultToJSONRPCResponse = (
  id: JSONRPCID | undefined,
  result: any
): JSONRPCResponse | null => {
  if (id !== undefined) {
    return {
      jsonrpc: JSONRPC,
      id,
      result: result === undefined ? null : result,
    };
  } else {
    return null;
  }
};

const mapErrorToJSONRPCResponse = (
  id: JSONRPCID | undefined,
  error: any
): JSONRPCResponse | null => {
  if (id !== undefined) {
    return createJSONRPCErrorResponse(
      id,
      DefaultErrorCode,
      (error && error.message) || "An unexpected error occurred"
    );
  } else {
    return null;
  }
};

const mapResponse = (
  request: JSONRPCRequest,
  response: JSONRPCResponse | null
): JSONRPCResponse | null => {
  if (response) {
    return response;
  } else if (request.id !== undefined) {
    return createJSONRPCErrorResponse(
      request.id,
      JSONRPCErrorCode.InternalError,
      "Internal error"
    );
  } else {
    return null;
  }
};
