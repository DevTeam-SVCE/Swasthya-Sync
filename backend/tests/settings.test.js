const test = require("node:test");
const assert = require("node:assert/strict");
const { validateSettingsInput } = require("../src/settings");

test("settings validation accepts partial updates and normalizes text", () => {
  assert.deepEqual(validateSettingsInput({ hospitalName: "  City Hospital  ", tagline: "  Care first  " }), {
    values: { hospitalName: "City Hospital", tagline: "Care first" },
  });
});

test("settings validation rejects invalid bodies and unknown fields", () => {
  assert.match(validateSettingsInput(null).error, /JSON object/);
  assert.match(validateSettingsInput({ unexpected: "value" }).error, /Unknown Settings field/);
  assert.match(validateSettingsInput({ hospitalName: "  " }).error, /required/);
});

test("settings validation checks email, phone, mode, and uploaded asset URLs", () => {
  assert.match(validateSettingsInput({ email: "not-an-email" }).error, /valid hospital email/);
  assert.match(validateSettingsInput({ phone: "abc" }).error, /valid hospital phone/);
  assert.match(validateSettingsInput({ brandingMode: "other" }).error, /Branding mode/);
  assert.match(validateSettingsInput({ primaryLogoUrl: "/uploads/settings/other.png" }).error, /uploaded branding image/);
});