import "mocha";
import { expect } from "chai";
import { JSONRPCServerAndClient, JSONRPCServer } from ".";
import { JSONRPCClient } from "./client";

interface EchoParams {
  message: string;
}

describe("JSONRPCServerAndClient", () => {
  let serverAndClient1: JSONRPCServerAndClient;
  let serverAndClient2: JSONRPCServerAndClient;

  beforeEach(() => {
    serverAndClient1 = new JSONRPCServerAndClient(
      new JSONRPCServer(),
      new JSONRPCClient((payload: object) => {
        return serverAndClient2.receiveAndSend(payload);
      })
    );

    serverAndClient2 = new JSONRPCServerAndClient(
      new JSONRPCServer(),
      new JSONRPCClient((payload: object) => {
        return serverAndClient1.receiveAndSend(payload);
      })
    );

    serverAndClient1.addMethod("echo1", ({ message }: EchoParams) => message);

    serverAndClient2.addMethod("echo2", ({ message }: EchoParams) => message);
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

  describe("requseting from server 2", () => {
    let result: string;
    beforeEach(async () => {
      result = await serverAndClient2.request("echo1", { message: "bar" });
    });

    it("should request to server 1", () => {
      expect(result).to.equal("bar");
    });
  });
});
