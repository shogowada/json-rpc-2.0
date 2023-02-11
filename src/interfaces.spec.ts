import "mocha";
import { expect } from "chai";
import {
  TypedJSONRPCClient,
  TypedJSONRPCServer,
  TypedJSONRPCServerAndClient,
} from "./interfaces";
import { JSONRPCClient } from "./client";
import { JSONRPCRequest } from "./models";
import { JSONRPCServer } from "./server";
import { JSONRPCServerAndClient } from "./server-and-client";

type Methods = {
  noArgsNoReturn(): void;
  noArgs(): string;
  objectArgs(params: { foo: string; bar: number }): string;
  arrayArgs(params: [string, number]): string;
};

describe("typed client and server", () => {
  let client: TypedJSONRPCClient<Methods>;
  let server: TypedJSONRPCServer<Methods>;
  let serverAndClient1: TypedJSONRPCServerAndClient<Methods>;
  let serverAndClient2: TypedJSONRPCServerAndClient<Methods>;

  beforeEach(() => {
    client = new JSONRPCClient<void>(async (request: JSONRPCRequest) => {
      const response = await server.receive(request);
      if (response) {
        client.receive(response);
      }
    });

    server = new JSONRPCServer<void>();

    serverAndClient1 = new JSONRPCServerAndClient(
      server,
      new JSONRPCClient<void>((request: JSONRPCRequest) =>
        serverAndClient2.receiveAndSend(request)
      )
    );

    serverAndClient2 = new JSONRPCServerAndClient(
      server,
      new JSONRPCClient<void>((request) =>
        serverAndClient1.receiveAndSend(request)
      )
    );
  });

  describe("calling method with no args no return", () => {
    let noArgsNoReturnCalled: boolean;

    beforeEach(() => {
      noArgsNoReturnCalled = false;

      server.addMethod("noArgsNoReturn", (): void => {
        noArgsNoReturnCalled = true;
      });
    });

    describe("through client", () => {
      beforeEach(() => {
        return client.request("noArgsNoReturn");
      });

      it("should call the method", () => {
        expect(noArgsNoReturnCalled).to.be.true;
      });
    });

    describe("through server and client", () => {
      beforeEach(() => {
        return serverAndClient1.request("noArgsNoReturn");
      });

      it("should call the method", () => {
        expect(noArgsNoReturnCalled).to.be.true;
      });
    });
  });

  describe("calling method with no args", () => {
    let expected: string;

    beforeEach(async () => {
      expected = "return value";

      server.addMethod("noArgs", (): string => {
        return expected;
      });
    });

    describe("through client", () => {
      let actual: string;

      beforeEach(async () => {
        actual = await client.request("noArgs");
      });

      it("should call the method", () => {
        expect(actual).to.equal(expected);
      });
    });

    describe("through server and client", () => {
      let actual: string;

      beforeEach(async () => {
        actual = await serverAndClient1.request("noArgs");
      });

      it("should call the method", () => {
        expect(actual).to.equal(expected);
      });
    });
  });

  describe("calling method with object args", () => {
    beforeEach(async () => {
      server.addMethod(
        "objectArgs",
        ({ foo, bar }: { foo: string; bar: number }): string => {
          return `${foo}.${bar}`;
        }
      );
    });

    describe("through client", () => {
      let actual: string;

      beforeEach(async () => {
        actual = await client.request("objectArgs", {
          foo: "string value",
          bar: 123,
        });
      });

      it("should call the method", () => {
        expect(actual).to.equal("string value.123");
      });
    });

    describe("through server and client", () => {
      let actual: string;

      beforeEach(async () => {
        actual = await serverAndClient1.request("objectArgs", {
          foo: "string value",
          bar: 123,
        });
      });

      it("should call the method", () => {
        expect(actual).to.equal("string value.123");
      });
    });
  });

  describe("calling method with array args", () => {
    beforeEach(async () => {
      server.addMethod("arrayArgs", ([foo, bar]: [string, number]): string => {
        return `${foo}.${bar}`;
      });
    });

    describe("through client", () => {
      let actual: string;

      beforeEach(async () => {
        actual = await client.request("arrayArgs", ["string value", 123]);
      });

      it("should call the method", () => {
        expect(actual).to.equal("string value.123");
      });
    });

    describe("through client", () => {
      let actual: string;

      beforeEach(async () => {
        actual = await serverAndClient1.request("arrayArgs", [
          "string value",
          123,
        ]);
      });

      it("should call the method", () => {
        expect(actual).to.equal("string value.123");
      });
    });
  });
});
