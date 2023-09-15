import { assert, expect } from "chai";
import { ethers } from "hardhat";
import { Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { signForwardRequest } from "./helpers/eip2771";

async function deploy(): Promise<Contract[]> {
  const contextStorageDevFactory = await ethers.getContractFactory("ContextStorageDev");
  const contextStorageDev = await contextStorageDevFactory.deploy();
  const minimalForwarderFactory = await ethers.getContractFactory("CheckMinimalForwarder");
  const minimalForwarder = await minimalForwarderFactory.deploy();

  return [contextStorageDev, minimalForwarder];
}

describe("ContextStorage", () => {
  let deployer: SignerWithAddress;
  let operator: SignerWithAddress;
  let alice: SignerWithAddress;

  before(async () => {
    [deployer, operator, alice] = await ethers.getSigners();
  });

  describe("Config", () => {
    let contextStorageDev: Contract;
    let minimalForwarder: Contract;
    beforeEach(async function () {
      [contextStorageDev, minimalForwarder] = await deploy();
    });

    it("no trusted forwarder by default", async function () {
      assert.isFalse(await contextStorageDev.isTrustedForwarder(minimalForwarder.address));
    });

    it("the owner can set a trusted forwarder", async function () {
      await contextStorageDev.connect(deployer).setTrustedForwarder(minimalForwarder.address, true);
      assert.isTrue(await contextStorageDev.isTrustedForwarder(minimalForwarder.address));
    });

    it("non owner cannot set a trusted forwarder", async function () {
      const tx = contextStorageDev.connect(alice).setTrustedForwarder(minimalForwarder.address, true);
      await expect(tx).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("the owner can unset a trusted forwarder", async function () {
      await contextStorageDev.connect(deployer).setTrustedForwarder(minimalForwarder.address, true);
      await contextStorageDev.connect(deployer).setTrustedForwarder(minimalForwarder.address, false);
      assert.isFalse(await contextStorageDev.isTrustedForwarder(minimalForwarder.address));
    });

    it("the owner can set a trusted forwarder again", async function () {
      await contextStorageDev.connect(deployer).setTrustedForwarder(minimalForwarder.address, true);
      await contextStorageDev.connect(deployer).setTrustedForwarder(minimalForwarder.address, false);
      await contextStorageDev.connect(deployer).setTrustedForwarder(minimalForwarder.address, true);
      assert.isTrue(await contextStorageDev.isTrustedForwarder(minimalForwarder.address));
    });

    it("setting a trusted forwarder emits the event", async function () {
      const tx = contextStorageDev.connect(deployer).setTrustedForwarder(minimalForwarder.address, true);
      await expect(tx)
        .to.emit(contextStorageDev, "SetTrustedForwarder")
        .withArgs(minimalForwarder.address, true, deployer.address);
    });

    it("unsetting a trusted forwarder emits the event", async function () {
      await contextStorageDev.connect(deployer).setTrustedForwarder(minimalForwarder.address, true);
      const tx = contextStorageDev.connect(deployer).setTrustedForwarder(minimalForwarder.address, false);
      await expect(tx)
        .to.emit(contextStorageDev, "SetTrustedForwarder")
        .withArgs(minimalForwarder.address, false, deployer.address);
    });

    it("unlocked by default", async function () {
      assert.isFalse(await contextStorageDev.trustedForwardersLocked());
    });

    it("the owner can lock", async function () {
      await contextStorageDev.connect(deployer).lockTrustedForwarders();
      assert.isTrue(await contextStorageDev.trustedForwardersLocked());
    });

    it("non owner cannot lock", async function () {
      const tx = contextStorageDev.connect(alice).lockTrustedForwarders();
      await expect(tx).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("non owner cannot unlock", async function () {
      await contextStorageDev.connect(deployer).lockTrustedForwarders();
      const tx = contextStorageDev.connect(deployer).lockTrustedForwarders();
      await expect(tx).to.be.revertedWith("ContextStorage: locked");
    });

    it("cannot change a trusted forwarder after locking", async function () {
      await contextStorageDev.connect(deployer).lockTrustedForwarders();
      const tx = contextStorageDev.connect(deployer).setTrustedForwarder(minimalForwarder.address, true);
      await expect(tx).to.be.revertedWith("ContextStorage: locked");
    });

    it("locking emits the event", async function () {
      const tx = contextStorageDev.connect(deployer).lockTrustedForwarders();
      await expect(tx).to.emit(contextStorageDev, "TrustedForwardersLocked").withArgs(deployer.address);
    });
  });

  describe("Metatx", function () {
    it("Successful metatx", async function () {
      // operator agreed to pay for gas
      const [contextStorageDev, minimalForwarder] = await deploy();
      await contextStorageDev.connect(deployer).setTrustedForwarder(minimalForwarder.address, true);

      // this is tx without signature
      const tx = await contextStorageDev.populateTransaction.test("0xaabbccddeeff");

      const forwardRequest = {
        from: alice.address,
        to: contextStorageDev.address,
        value: ethers.constants.Zero,
        gas: ethers.BigNumber.from(300000),
        nonce: ethers.constants.Zero,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        data: ethers.utils.arrayify(tx.data!), // takes only data from tx
      };
      // forwardRequest + forwardRequestSig is metatx actually
      const forwardRequestSig = await signForwardRequest(alice, minimalForwarder.address, forwardRequest);

      // this wraps metatx, sent by operator so operator pays for gas
      const wrappingTx = minimalForwarder.connect(operator).checkExecute(forwardRequest, forwardRequestSig);

      const expectedCalldata = (await contextStorageDev.populateTransaction.test("0xaabbccddeeff")).data;
      await expect(wrappingTx)
        .to.emit(contextStorageDev, "TestResult")
        .withArgs(alice.address, "0xaabbccddeeff", expectedCalldata);
    });

    it("Failed metatx - untrusted forwarder", async function () {
      // operator agreed to pay for gas
      const [contextStorageDev, minimalForwarder] = await deploy();

      // this is tx without signature
      const tx = await contextStorageDev.populateTransaction.test("0xaabbccddeeff");

      const forwardRequest = {
        from: alice.address,
        to: contextStorageDev.address,
        value: ethers.constants.Zero,
        gas: ethers.BigNumber.from(300000),
        nonce: ethers.constants.Zero,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        data: ethers.utils.arrayify(tx.data!), // takes only data from tx
      };
      // forwardRequest + forwardRequestSig is metatx actually
      const forwardRequestSig = await signForwardRequest(alice, minimalForwarder.address, forwardRequest);

      // this wraps metatx, sent by operator so operator pays for gas
      const wrappingTx = minimalForwarder.connect(operator).checkExecute(forwardRequest, forwardRequestSig);

      // the forwarder appends the sender address
      const expectedCalldata =
        (await contextStorageDev.populateTransaction.test("0xaabbccddeeff")).data +
        alice.address.toLowerCase().substring(2);
      // since the sender is recognized as the forwarder, the metatx is considered failed
      await expect(wrappingTx)
        .to.emit(contextStorageDev, "TestResult")
        .withArgs(minimalForwarder.address, "0xaabbccddeeff", expectedCalldata);
    });

    it("Direct tx", async function () {
      // operator agreed to pay for gas
      const [contextStorageDev] = await deploy();

      // this is tx without signature
      const tx = contextStorageDev.connect(alice).test("0xaabbccddeeff");

      const expectedCalldata = (await contextStorageDev.populateTransaction.test("0xaabbccddeeff")).data;
      await expect(tx)
        .to.emit(contextStorageDev, "TestResult")
        .withArgs(alice.address, "0xaabbccddeeff", expectedCalldata);
    });
  });
});
