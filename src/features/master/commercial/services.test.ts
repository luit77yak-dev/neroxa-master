import { describe, expect, it } from "vitest";
import {
  isAllowedContractTransition,
  isAllowedProposalTransition,
} from "./services";

describe("proposal transitions", () => {
  it("allows the documented forward and negotiation transitions", () => {
    expect(isAllowedProposalTransition("DRAFT", "SENT")).toBe(true);
    expect(isAllowedProposalTransition("SENT", "NEGOTIATION")).toBe(true);
    expect(isAllowedProposalTransition("NEGOTIATION", "ACCEPTED")).toBe(true);
  });

  it("does not reopen final proposals", () => {
    expect(isAllowedProposalTransition("ACCEPTED", "SENT")).toBe(false);
    expect(isAllowedProposalTransition("REJECTED", "NEGOTIATION")).toBe(false);
    expect(isAllowedProposalTransition("CANCELLED", "DRAFT")).toBe(false);
  });
});

describe("contract transitions", () => {
  it("allows activation, suspension and reactivation", () => {
    expect(isAllowedContractTransition("DRAFT", "ACTIVE")).toBe(true);
    expect(isAllowedContractTransition("ACTIVE", "SUSPENDED")).toBe(true);
    expect(isAllowedContractTransition("SUSPENDED", "ACTIVE")).toBe(true);
  });

  it("does not reopen terminated or expired contracts", () => {
    expect(isAllowedContractTransition("TERMINATED", "ACTIVE")).toBe(false);
    expect(isAllowedContractTransition("EXPIRED", "ACTIVE")).toBe(false);
  });
});
