import {
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCParams,
  JSONRPC,
  JSONRPCID,
  JSONRPCErrorCode
} from "./models";

export type SendResponse = (response: JSONRPCResponse) => PromiseLike<void>;

export const jsonRPCServer = (sendResponse: SendResponse): JSONRPCServer =>
  new JSONRPCServer(sendResponse);

export type SimpleJSONRPCMethod = (params?: Partial<JSONRPCParams>) => any;
export type JSONRPCMethod = (
  request: JSONRPCRequest
) => PromiseLike<JSONRPCResponse | null>;

type NameToMethodDictionary = { [name: string]: JSONRPCMethod };

const DefaultErrorCode = 0;

export class JSONRPCServer {
  private nameToMethodDictionary: NameToMethodDictionary;

  constructor(private sendResponse: SendResponse) {
    this.nameToMethodDictionary = {};
  }

  addMethod(name: string, method: SimpleJSONRPCMethod): void {
    this.addMethodAdvanced(name, this.toJSONRPCMethod(method));
  }

  private toJSONRPCMethod(method: SimpleJSONRPCMethod): JSONRPCMethod {
    return (request: JSONRPCRequest): PromiseLike<JSONRPCResponse | null> =>
      Promise.resolve(method(request.params)).then(
        (result: any) => mapResultToJSONRPCResponse(request.id, result),
        (error: any) => mapErrorToJSONRPCResponse(request.id, error)
      );
  }

  addMethodAdvanced(name: string, method: JSONRPCMethod): void {
    this.nameToMethodDictionary = {
      ...this.nameToMethodDictionary,
      [name]: method
    };
  }

  receive(request: JSONRPCRequest): PromiseLike<void> {
    const method = this.nameToMethodDictionary[request.method];
    if (method) {
      return method(request)
        .then(response => mapResponse(request, response))
        .then(this.sendResponse);
    } else if (request.id !== undefined) {
      return this.sendResponse({
        jsonrpc: JSONRPC,
        id: request.id,
        error: {
          code: JSONRPCErrorCode.MethodNotFound,
          message: "Method not found"
        }
      });
    } else {
      return Promise.resolve();
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
