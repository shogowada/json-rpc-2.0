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

export type SimpleJSONRPCMethod<ServerParams> = (
  params?: Partial<JSONRPCParams>,
  serverParams?: ServerParams
) => any;

export type JSONRPCMethod<ServerParams> = (
  request: JSONRPCRequest,
  serverParams?: ServerParams
) => JSONRPCResponsePromise;

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
    return async (
      request: JSONRPCRequest,
      serverParams: ServerParams
    ): Promise<JSONRPCResponse | null> => {
      try {
        const result = await method(request.params, serverParams);
        return mapResultToJSONRPCResponse(request.id, result);
      } catch (error) {
        console.warn(
          `JSON-RPC method ${request.method} responded an error`,
          error
        );
        return mapErrorToJSONRPCResponse(request.id, error);
      }
    };
  }

  addMethodAdvanced(name: string, method: JSONRPCMethod<ServerParams>): void {
    this.nameToMethodDictionary = {
      ...this.nameToMethodDictionary,
      [name]: method,
    };
  }

  async receive(
    request: JSONRPCRequest,
    serverParams?: ServerParams
  ): Promise<JSONRPCResponse | null> {
    const method = this.nameToMethodDictionary[request.method];

    if (!isJSONRPCRequest(request)) {
      const message = "Received an invalid JSON-RPC request";
      console.warn(message, request);
      throw new Error(message);
    } else if (method) {
      const response = await this.callMethod(method, request, serverParams);
      return mapResponse(request, response);
    } else if (request.id !== undefined) {
      return createMethodNotFoundResponse(request.id);
    } else {
      return null;
    }
  }

  private async callMethod(
    method: JSONRPCMethod<ServerParams>,
    request: JSONRPCRequest,
    serverParams?: ServerParams
  ): Promise<JSONRPCResponse | null> {
    try {
      return await method(request, serverParams);
    } catch (error) {
      console.warn(
        `An unexpected error occurred while executing "${request.method}" JSON-RPC method:`,
        error
      );
      return mapErrorToJSONRPCResponse(request.id, error);
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
