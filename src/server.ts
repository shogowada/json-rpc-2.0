import {
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCParams,
  JSONRPC,
  JSONRPCID,
  JSONRPCErrorCode
} from "./models";

export type SimpleJSONRPCMethod = (params?: Partial<JSONRPCParams>) => any;
export type JSONRPCMethod<ServerParams = void> = (
  request: JSONRPCRequest
) =>
  | JSONRPCResponsePromise
  | ((serverParams?: ServerParams) => JSONRPCResponsePromise);
export type JSONRPCResponsePromise = PromiseLike<JSONRPCResponse | null>;

type NameToMethodDictionary<ServerParams> = {
  [name: string]: JSONRPCMethod<ServerParams>;
};

const DefaultErrorCode = 0;

const createMethodNotFoundResponse = (id: JSONRPCID): JSONRPCResponse => ({
  jsonrpc: JSONRPC,
  id,
  error: {
    code: JSONRPCErrorCode.MethodNotFound,
    message: "Method not found"
  }
});

export class JSONRPCServer<ServerParams = void> {
  private nameToMethodDictionary: NameToMethodDictionary<ServerParams>;

  constructor() {
    this.nameToMethodDictionary = {};
  }

  addMethod(name: string, method: SimpleJSONRPCMethod): void {
    this.addMethodAdvanced(name, this.toJSONRPCMethod(method));
  }

  private toJSONRPCMethod(
    method: SimpleJSONRPCMethod
  ): JSONRPCMethod<ServerParams> {
    return (request: JSONRPCRequest) => (
      serverParams: ServerParams
    ): JSONRPCResponsePromise => {
      let response = method(request.params);
      if (typeof response === "function") {
        response = response(serverParams);
      }
      return Promise.resolve(response).then(
        (result: any) => mapResultToJSONRPCResponse(request.id, result),
        (error: any) => mapErrorToJSONRPCResponse(request.id, error)
      );
    };
  }

  addMethodAdvanced(name: string, method: JSONRPCMethod<ServerParams>): void {
    this.nameToMethodDictionary = {
      ...this.nameToMethodDictionary,
      [name]: method
    };
  }

  receive(
    request: JSONRPCRequest,
    serverParams?: ServerParams
  ): JSONRPCResponsePromise {
    const method = this.nameToMethodDictionary[request.method];
    if (method) {
      let response = method(request);
      if (typeof response === "function") {
        response = response(serverParams);
      }
      return response.then(response => mapResponse(request, response));
    } else if (request.id !== undefined) {
      return Promise.resolve(createMethodNotFoundResponse(request.id));
    } else {
      return Promise.resolve(null);
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
      result
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
    return {
      jsonrpc: JSONRPC,
      id,
      error: {
        code: DefaultErrorCode,
        message: error.message || "An unexpected error occurred"
      }
    };
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
    return {
      jsonrpc: JSONRPC,
      id: request.id,
      error: {
        code: JSONRPCErrorCode.InternalError,
        message: "Internal error"
      }
    };
  } else {
    return null;
  }
};
