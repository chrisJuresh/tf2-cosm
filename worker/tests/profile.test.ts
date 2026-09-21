import { describe, expect, it } from "vitest";

import { readProfile } from "../src/profile.ts";

/**
 * The whole surface of what a viewer may paste, as a table. People arrive with
 * whatever was in their address bar, and every row here is a thing somebody
 * actually has in theirs.
 */
describe("what the viewer pasted", () => {
  const ID = "76561197960435530";

  it.each([
    ["a bare SteamID64", ID],
    ["a profile URL", `https://steamcommunity.com/profiles/${ID}`],
    ["one with a trailing slash", `https://steamcommunity.com/profiles/${ID}/`],
    ["one with the inventory page under it", `https://steamcommunity.com/profiles/${ID}/inventory/#440`],
    ["one with no scheme", `steamcommunity.com/profiles/${ID}`],
    ["one with www", `https://www.steamcommunity.com/profiles/${ID}`],
    ["one with http", `http://steamcommunity.com/profiles/${ID}`],
    ["one with spaces around it", `  https://steamcommunity.com/profiles/${ID}  `],
  ])("reads %s as a SteamID64, with no lookup to do", (_what, pasted) => {
    expect(readProfile(pasted)).toEqual({ kind: "steam-id", steamId: ID });
  });

  it.each([
    ["a bare vanity name", "gabelogannewell"],
    ["a custom URL", "https://steamcommunity.com/id/gabelogannewell"],
    ["one with a trailing slash", "https://steamcommunity.com/id/gabelogannewell/"],
    ["one with the inventory page under it", "https://steamcommunity.com/id/gabelogannewell/inventory/"],
    ["one percent-encoded", "https://steamcommunity.com/id/gabelogannewell%2F".replace("%2F", "")],
  ])("reads %s as a vanity name, which has to be looked up", (_what, pasted) => {
    expect(readProfile(pasted)).toEqual({ kind: "vanity", vanity: "gabelogannewell" });
  });

  it("keeps a vanity name's case, because Steam's URLs are what they are", () => {
    expect(readProfile("https://steamcommunity.com/id/GabeLoganNewell")).toEqual({
      kind: "vanity",
      vanity: "GabeLoganNewell",
    });
  });

  it("takes a short run of digits as a custom URL, because somebody may have claimed one", () => {
    // The lookup that finds nothing tells them so honestly. Refusing it here
    // would refuse a name that might be real.
    expect(readProfile("1234567890")).toEqual({ kind: "vanity", vanity: "1234567890" });
  });

  it.each([
    ["nothing", ""],
    ["whitespace", "   "],
    ["a screen name with a space in it", "Gabe Newell"],
    ["a SteamID64 one digit short", "7656119796043553"],
    ["an ID outside the individual-account range", "76561297960435530"],
    ["a name too short to be a custom URL", "ab"],
    ["a Steam store link", "https://store.steampowered.com/app/440/"],
    ["a profile URL with no name on it", "https://steamcommunity.com/id/"],
  ])("refuses %s rather than guessing", (_what, pasted) => {
    expect(readProfile(pasted)).toBeUndefined();
  });

  it("refuses a near-miss SteamID64 rather than looking it up as a custom URL", () => {
    // An all-digit string is a legal custom URL, so a mistyped ID would
    // otherwise come back as "no profile at steamcommunity.com/id/765612979..."
    // — true, and no help at all to somebody who was typing an ID.
    expect(readProfile("76561297960435530")).toBeUndefined();
  });

  it("refuses a profile path on somebody else's host, so this is not a proxy for anything", () => {
    // The shape is right and the host is not. Honouring it would make `q` a way
    // to have this Worker fetch whatever a caller names.
    expect(readProfile("https://evil.example.com/id/anything")).toBeUndefined();
    expect(readProfile("https://steamcommunity.com.evil.example.com/id/anything")).toBeUndefined();
  });
});
