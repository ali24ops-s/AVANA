import { describe, it, expect } from "vitest";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { v1Routes } from "../routes/v1.js";
import { composeLocalDev } from "../server/composeLocalDev.js";

describe("Local Dev Auth Flow Regression Tests", () => {
  it("executes Register, Sign-in, and Dual-Channel Verification under composeLocalDev without 500 errors", async () => {
    process.env.NODE_ENV = "development";
    const config = loadApiConfig();
    const local = await composeLocalDev(config);
    const app = createApp({ config });
    await app.register(v1Routes, local.v1Options);

    // 1. Register with all 4 required fields (first/last name, email, phone, password)
    const regRes = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        firstName: "علی",
        lastName: "علوی",
        email: "ali_local_dev@example.com",
        phoneNumber: "09121112233",
        password: "password123",
      },
    });
    expect(regRes.statusCode).toBe(200);
    const regBody = JSON.parse(regRes.body);
    expect(regBody.user.email).toBe("ali_local_dev@example.com");
    expect(regBody.user.phoneNumber).toBe("+989121112233");
    expect(regBody.user.emailVerified).toBe(false);
    expect(regBody.user.phoneVerified).toBe(false);
    expect(regBody.user.isVerified).toBe(false);

    const regDeviceId = regRes.cookies.find((c) => c.name === "avana_device_id")?.value;
    expect(regDeviceId).toBeDefined();

    // 2. Sign-in with Email and Password using recognized device cookie
    const loginRes = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      cookies: {
        avana_device_id: regDeviceId!,
      },
      payload: {
        email: "ali_local_dev@example.com",
        password: "password123",
      },
    });
    expect(loginRes.statusCode).toBe(200);
    const loginSession = loginRes.cookies.find((c) => c.name === "avana_session")?.value;
    expect(loginSession).toBeDefined();

    // 3. Request SMS verification challenge for phone channel
    const sendPhoneRes = await app.inject({
      method: "POST",
      url: "/v1/auth/verification/send",
      cookies: {
        avana_session: loginSession!,
      },
      payload: {
        channel: "phone",
      },
    });
    expect(sendPhoneRes.statusCode).toBe(200);
    const sendPhoneBody = JSON.parse(sendPhoneRes.body);
    expect(sendPhoneBody.channel).toBe("phone");

    // 4. Send phone login OTP before phone is verified -> Expect 403 Forbidden (not 500)
    const sendOtpUnverified = await app.inject({
      method: "POST",
      url: "/v1/auth/phone/send-otp",
      payload: {
        phoneNumber: "09121112233",
      },
    });
    expect(sendOtpUnverified.statusCode).toBe(403);
    const unverifiedErr = JSON.parse(sendOtpUnverified.body);
    expect(unverifiedErr.error.code).toBe("forbidden");

    await app.close();
  });
});


