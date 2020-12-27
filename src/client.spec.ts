import { describe, beforeEach, it } from "mocha";
import { expect } from "chai";
import {
  JSONRPCClient,
  JSONRPC,
  JSONRPCResponse,
  JSONRPCRequest,
  JSONRPCRemoteError,
} from ".";

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

    client = new JSONRPCClient(
      (request, clientParams) => {
        lastRequest = request;
        lastClientParams = clientParams;
        return new Promise((givenResolve, givenReject) => {
          resolve = givenResolve;
          reject = givenReject;
        });
      },
      () => ++id
    );
  });

  describe("requesting", () => {
    let result: any;
    let error: any;
    let promise: PromiseLike<void>;

    beforeEach(() => {
      result = undefined;
      error = undefined;

      promise = client.request("foo", ["bar"]).then(
        (givenResult) => (result = givenResult),
        (givenError) => (error = givenError)
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
              data: {
                test: true,
              },
            },
          };

          client.receive(response);

          return promise;
        });

        it("should reject with the error message", () => {
          expect(error.message).to.equal(response.error!.message);
          expect(error.code).to.equal(0);
          expect(error.data.test).to.equal(true);
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
            };

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
            };

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

  describe("notifying", () => {
    beforeEach(() => {
      client.notify("foo", ["bar"]);
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
