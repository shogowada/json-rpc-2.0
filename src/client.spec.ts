import { describe, beforeEach, it } from "mocha";
import { expect } from "chai";
import * as sinon from "sinon";
import {
  JSONRPCClient,
  JSONRPC,
  JSONRPCResponse,
  JSONRPCRequest,
  JSONRPCID,
  JSONRPCErrorResponse,
  createJSONRPCErrorResponse,
  JSONRPCErrorException,
  JSONRPCError,
} from "./index.js";

interface ClientParams {
  token: string;
}

describe("JSONRPCClient", () => {
  let client: JSONRPCClient<ClientParams>;

  let id: number;
  let lastRequest: JSONRPCRequest | undefined;
  let lastClientParams: ClientParams | undefined;
  let resolve: (() => void) | undefined;
  let reject: ((error: any) => void) | undefined;

  beforeEach(() => {
    id = 0;
    lastRequest = undefined;
    resolve = undefined;
    reject = undefined;

    const send = (
      request: JSONRPCRequest,
      clientParams: ClientParams,
    ): PromiseLike<void> => {
      lastRequest = request;
      lastClientParams = clientParams;
      return new Promise((givenResolve, givenReject) => {
        resolve = givenResolve;
        reject = givenReject;
      });
    };

    client = new JSONRPCClient(send, () => ++id);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("requesting", () => {
    let result: any;
    let error: any;
    let promise: PromiseLike<void>;

    beforeEach(() => {
      result = undefined;
      error = undefined;

      promise = client.request("foo", ["bar"], { token: "" }).then(
        (givenResult) => (result = givenResult),
        (givenError) => (error = givenError),
      );
    });

    it("should send the request", () => {
      expect(lastRequest).to.deep.equal({
        jsonrpc: JSONRPC,
        id,
        method: "foo",
        params: ["bar"],
      });
    });

    describe("succeeded on client side", () => {
      beforeEach(() => {
        resolve!();
      });

      describe("and succeeded on server side too", () => {
        let response: JSONRPCResponse;

        beforeEach(() => {
          response = {
            jsonrpc: JSONRPC,
            id,
            result: "foo",
          };

          client.receive(response);

          return promise;
        });

        it("should resolve the result", () => {
          expect(result).to.equal(response.result);
        });
      });

      describe("and succeeded on server side with falsy but defined result", () => {
        beforeEach(() => {
          client.receive({
            jsonrpc: JSONRPC,
            id,
            result: 0,
          });

          return promise;
        });

        it("should resolve the result", () => {
          expect(result).to.equal(0);
        });
      });

      describe("but failed on server side", () => {
        let response: JSONRPCResponse;

        beforeEach(() => {
          response = {
            jsonrpc: JSONRPC,
            id,
            error: {
              code: 0,
              message: "This is a test. Do not panic.",
              data: { optional: "data" },
            },
          };

          client.receive(response);

          return promise;
        });

        it("should reject with the error message, code and data", () => {
          expect(error.message).to.equal(response.error!.message);
          expect(error.code).to.equal(response.error!.code);
          expect(error.data).to.equal(response.error!.data);
        });

        it("should reject with a JSONRPCErrorException", () => {
          expect(error instanceof Error).to.be.true;
          expect(error instanceof JSONRPCErrorException).to.be.true;
          expect(error.toObject()).to.deep.equal(response.error);
        });
      });

      describe("but server responded invalid response", () => {
        describe("like having both result and error", () => {
          let response: JSONRPCResponse;

          beforeEach(() => {
            response = {
              jsonrpc: JSONRPC,
              id,
              result: "foo",
              error: {
                code: 0,
                message: "bar",
              },
            } as any;

            client.receive(response);

            return promise;
          });

          it("should reject", () => {
            expect(error).to.not.be.undefined;
          });
        });

        describe("like not having both result and error", () => {
          let response: JSONRPCResponse;

          beforeEach(() => {
            response = {
              jsonrpc: JSONRPC,
              id,
            } as any;

            client.receive(response);

            return promise;
          });

          it("should reject", () => {
            expect(error).to.not.be.undefined;
          });
        });
      });

      describe("but I reject all pending requests", () => {
        let message: string;

        beforeEach(() => {
          message = "Connection is closed.";

          client.rejectAllPendingRequests(message);

          return promise;
        });

        it("should reject the request", () => {
          expect(error.message).to.equal(message);
        });

        describe("receiving a response", () => {
          beforeEach(() => {
            client.receive({
              jsonrpc: JSONRPC,
              id,
              result: "foo",
            });

            return promise;
          });

          it("should not resolve the promise again", () => {
            expect(result).to.be.undefined;
          });
        });
      });
    });

    describe("failed on client side", () => {
      let expected: Error;

      beforeEach(() => {
        expected = new Error("This is a test. Do not panic.");

        reject!(expected);

        return promise;
      });

      it("should reject the promise", () => {
        expect(error.message).to.equal(expected.message);
      });
    });

    describe("failed on client side with no error object", () => {
      beforeEach(() => {
        reject!(undefined);

        return promise;
      });

      it("should reject the promise", () => {
        expect(error.message).to.equal("Failed to send a request");
      });
    });

    describe("failed on client side with an error object without message", () => {
      beforeEach(() => {
        reject!({});

        return promise;
      });

      it("should reject the promise", () => {
        expect(error.message).to.equal("Failed to send a request");
      });
    });
  });

  describe("requesting batch", () => {
    let requests: JSONRPCRequest[];
    let actualResponses: JSONRPCResponse[];
    let expectedResponses: JSONRPCResponse[];

    beforeEach(() => {
      requests = [
        { jsonrpc: JSONRPC, id: 0, method: "foo" },
        { jsonrpc: JSONRPC, id: 1, method: "foo2" },
      ];

      client
        .requestAdvanced(requests, { token: "" })
        .then((responses) => (actualResponses = responses));

      resolve!();

      expectedResponses = [
        { jsonrpc: JSONRPC, id: 0, result: "foo" },
        { jsonrpc: JSONRPC, id: 1, result: "foo2" },
      ];
      client.receive(expectedResponses);
    });

    it("should send requests in batch", () => {
      expect(lastRequest).to.deep.equal(requests);
    });

    it("should return responses", () => {
      expect(actualResponses).to.deep.equal(expectedResponses);
    });
  });

  describe("requesting with client params", () => {
    let expected: ClientParams;
    beforeEach(() => {
      expected = { token: "baz" };

      client.request("foo", undefined, expected);
    });

    it("should pass the client params to send function", () => {
      expect(lastClientParams).to.deep.equal(expected);
    });
  });

  describe("requesting with timeout", () => {
    let delay: number;
    let fakeTimers: sinon.SinonFakeTimers;
    let promise: PromiseLike<any>;

    beforeEach(() => {
      fakeTimers = sinon.useFakeTimers();
      delay = 1000;

      promise = client.timeout(delay).request("foo");

      resolve!();
    });

    describe("timing out", () => {
      beforeEach(() => {
        fakeTimers.tick(delay);
      });

      it("should reject", () => {
        return promise.then(
          () => Promise.reject(new Error("Expected to fail")),
          () => undefined,
        );
      });
    });

    describe("not timing out", () => {
      let result: string;

      beforeEach(() => {
        result = "foo";
        client.receive({
          jsonrpc: JSONRPC,
          id: lastRequest!.id!,
          result,
        });
      });

      it("should respond", async () => {
        const actual: string = await promise;
        expect(actual).to.equal(result);
      });
    });
  });

  describe("requesting advanced with timeout", () => {
    let delay: number;
    let fakeTimers: sinon.SinonFakeTimers;
    let promise: PromiseLike<JSONRPCResponse>;

    beforeEach(() => {
      fakeTimers = sinon.useFakeTimers();
      delay = 1000;

      promise = client.timeout(delay).requestAdvanced({
        jsonrpc: JSONRPC,
        id: ++id,
        method: "foo",
      });

      resolve!();
    });

    describe("timing out", () => {
      beforeEach(() => {
        fakeTimers.tick(delay);
      });

      it("should reject", () => {
        return promise.then((result) => {
          if (!result.error) {
            return Promise.reject(new Error("Expected to fail"));
          }
        });
      });
    });

    describe("not timing out", () => {
      let result: JSONRPCResponse;

      beforeEach(() => {
        result = {
          jsonrpc: JSONRPC,
          id: lastRequest!.id!,
          result,
        };
        client.receive(result);
      });

      it("should respond", async () => {
        const actual: JSONRPCResponse = await promise;
        expect(actual).to.deep.equal(result);
      });
    });
  });

  describe("requesting with custom timeout error response", () => {
    let delay: number;
    let fakeTimers: sinon.SinonFakeTimers;
    let errorCode: number;
    let errorMessage: string;
    let errorData: string;
    let promise: PromiseLike<JSONRPCResponse>;

    beforeEach(() => {
      fakeTimers = sinon.useFakeTimers();
      delay = 1000;

      errorCode = 123;
      errorMessage = "Custom error message";
      errorData = "Custom error data";

      promise = client
        .timeout(
          delay,
          (id: JSONRPCID): JSONRPCErrorResponse =>
            createJSONRPCErrorResponse(id, errorCode, errorMessage, errorData),
        )
        .requestAdvanced({
          jsonrpc: JSONRPC,
          id: ++id,
          method: "foo",
        });

      resolve!();
    });

    describe("timing out", () => {
      beforeEach(() => {
        fakeTimers.tick(delay);
      });

      it("should reject with the custom error", async () => {
        const actual: JSONRPCResponse = await promise;
        const expected: JSONRPCError = {
          code: errorCode,
          message: errorMessage,
          data: errorData,
        };
        expect(actual.error).to.deep.equal(expected);
      });
    });
  });

  describe("notifying", () => {
    beforeEach(() => {
      client.notify("foo", ["bar"], { token: "" });
    });

    it("should send the notification", () => {
      expect(lastRequest).to.deep.equal({
        jsonrpc: JSONRPC,
        method: "foo",
        params: ["bar"],
      });
    });
  });

  describe("notifying with client params", () => {
    let expected: ClientParams;
    beforeEach(() => {
      expected = { token: "baz" };

      client.notify("foo", undefined, expected);
    });

    it("should pass the client params to send function", () => {
      expect(lastClientParams).to.deep.equal(expected);
    });
  });
});
