import { describe, beforeEach, it } from "mocha";
import { expect } from "chai";
import * as sinon from "sinon";
import {
  JSONRPCServerAndClient,
  JSONRPCServer,
  JSONRPCRequest,
  JSONRPC,
  JSONRPCResponse,
} from ".";
import { JSONRPCClient } from "./client";

interface EchoParams {
  message: string;
}

interface ServerParams {
  userID: string;
}

describe("JSONRPCServerAndClient", () => {
  let serverAndClient1: JSONRPCServerAndClient<ServerParams>;
  let serverAndClient2: JSONRPCServerAndClient<void, ServerParams>;

  beforeEach(() => {
    serverAndClient1 = new JSONRPCServerAndClient(
      new JSONRPCServer<ServerParams>(),
      new JSONRPCClient((payload: object) => {
        return serverAndClient2.receiveAndSend(payload);
      })
    );

    serverAndClient2 = new JSONRPCServerAndClient<void, ServerParams>(
      new JSONRPCServer(),
      new JSONRPCClient<ServerParams>(
        (payload: object, params: ServerParams) => {
          return serverAndClient1.receiveAndSend(payload, params);
        }
      )
    );

    serverAndClient1.addMethod("echo1", ({ message }: EchoParams) => message);
    serverAndClient1.addMethodAdvanced(
      "echo1-2",
      async (
        jsonRPCRequest: JSONRPCRequest,
        { userID }: ServerParams
      ): Promise<JSONRPCResponse> => ({
        jsonrpc: JSONRPC,
        id: jsonRPCRequest.id!,
        result: `${userID} said ${
          (jsonRPCRequest.params as EchoParams).message
        }`,
      })
    );

    serverAndClient2.addMethod("echo2", ({ message }: EchoParams) => message);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("requesting from server 1", () => {
    let result: string;
    beforeEach(async () => {
      result = await serverAndClient1.request("echo2", { message: "foo" });
    });

    it("should request to server 2", () => {
      expect(result).to.equal("foo");
    });
  });

  describe("requesting from server 2", () => {
    let result: string;
    beforeEach(async () => {
      result = await serverAndClient2.request("echo1", { message: "bar" });
    });

    it("should request to server 1", () => {
      expect(result).to.equal("bar");
    });
  });

  describe("requesting from server 1 using advanced method", () => {
    let response: JSONRPCResponse;
    beforeEach(async () => {
      const request: JSONRPCRequest = {
        jsonrpc: JSONRPC,
        id: 0,
        method: "echo1-2",
        params: { message: "test" },
      };

      response = await serverAndClient2.requestAdvanced(request, {
        userID: "baz",
      });
    });

    it("should request to server 1", () => {
      expect(response.result).to.equal(`baz said test`);
    });
  });

  describe("receiving invalid JSON-RPC message", () => {
    let promise: PromiseLike<void>;

    beforeEach(() => {
      promise = serverAndClient1.receiveAndSend({});
    });

    it("should fail", () => {
      return promise.then(
        () => Promise.reject(new Error("Expected to fail")),
        () => undefined
      );
    });
  });

  describe("having a pending request", () => {
    let promise: PromiseLike<void>;
    let resolve: () => void;
    beforeEach(() => {
      serverAndClient2.addMethod("hang", () => {
        return new Promise<void>((givenResolve) => (resolve = givenResolve));
      });

      promise = serverAndClient1.request("hang");
    });

    describe("rejecting all pending requests", () => {
      let message: string;
      beforeEach(() => {
        message = "Connection is closed.";

        serverAndClient1.rejectAllPendingRequests(message);

        resolve();
      });

      it("should reject the pending request", () => {
        return promise.then(
          () => Promise.reject(new Error("Expected to fail")),
          (error) => expect(error.message).to.equal(message)
        );
      });
    });
  });

  describe("requesting with timeout", () => {
    let fakeTimers: sinon.SinonFakeTimers;
    let delay: number;
    let resolve: () => void;
    let promise: PromiseLike<any>;

    beforeEach(() => {
      fakeTimers = sinon.useFakeTimers();

      delay = 100;
      serverAndClient2.addMethod(
        "timeout",
        () => new Promise<void>((givenResolve) => (resolve = givenResolve))
      );

      promise = serverAndClient1.timeout(delay).request("timeout");
    });

    describe("timing out", () => {
      beforeEach(() => {
        fakeTimers.tick(delay);
        resolve();
      });

      it("should reject", () => {
        return promise.then(
          () => Promise.reject(new Error("Expected to fail")),
          () => undefined
        );
      });
    });

    describe("not timing out", () => {
      beforeEach(() => {
        resolve();
      });

      it("should succeed", () => {
        return promise;
      });
    });
  });
});
