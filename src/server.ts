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
) => PromiseLike<JSONRPCResponse | null>;

export type ErrorDataGetter = (error: any) => any;

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

  getErrorData?: ErrorDataGetter;

  constructor(options?: { getErrorData?: ErrorDataGetter }) {
    this.nameToMethodDictionary = {};
    this.getErrorData = options?.getErrorData;
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
        return this.mapErrorToJSONRPCResponse(request.id, error);
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
      return this.mapErrorToJSONRPCResponse(request.id, error);
    }
  }

  private mapErrorToJSONRPCResponse(id: JSONRPCID | undefined, error: any) {
    if (id !== undefined) {
      return createJSONRPCErrorResponse(
        id,
        DefaultErrorCode,
        (error && error.message) || "An unexpected error occurred",
        this.getErrorData ? this.getErrorData(error) : undefined
      );
    } else {
      return null;
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
