import { del } from "idb-keyval";
import { navigate } from "svelte-navigator";

import { zxcvbn } from "@zxcvbn-ts/core";
import sodium from "libsodium-wrappers-sumo";

import { emailVerificationRequired, localSecrets, setLocalSecrets } from "../stores";
import apiClient from "./apiClient";
import type { CreateUserModel, PublicUserModel, UserJtiModel, UserModel } from "./client";
import { base64Decode, base64Encode } from "./crypto/codecUtils";
import secretKey from "./crypto/secretKey";
import signatures from "./crypto/signatures";


export class LoginError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class RegisterError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class OtpRequiredError extends Error {
  constructor() {
    super();
    this.message = "OTP code required";
  }
}


export async function logout() {
  // Catch if private tab.
  try {
    await del("localSecrets");
  } catch { }

  // Wipe localSecrets store.
  localSecrets.set(undefined);
  emailVerificationRequired.set(false);

  // Navigate to home page.
  navigate("/", { replace: true });

  // Attempt logout request, may 401.
  try {
    await apiClient.account.controllersAccountLogoutLogout();
  } catch { }
}

export async function* login(
  email: string, password: string,
  captchaToken?: string, otpCode?: string,
  passwordCache?: { pastPassword: { raw: string, derived: Uint8Array; }; }
): AsyncIterable<string | UserModel> {
  yield "libsodium blocks :(";

  if (captchaToken === "" && import.meta.env.VITE_MCAPTCHA_ENABLED === "true") {
    throw new LoginError("Captcha not completed");
  }

  let publicUser: PublicUserModel;
  try {
    publicUser = await apiClient.account.controllersAccountEmailPublicPublic(
      email
    );
  } catch (error) {
    throw new LoginError(error.body.detail);
  }

  // Somewhat hackie in memory caching system, so OTP code doesn't
  // expire to key deriving taking too long.
  let rawDerivedKey: Uint8Array;
  if (typeof passwordCache !== "undefined" && passwordCache.pastPassword.raw === password) {
    rawDerivedKey = passwordCache.pastPassword.derived;
  } else {
    const rawSalt = base64Decode(publicUser.kdf.salt);

    yield "Deriving key from password";

    rawDerivedKey = sodium.crypto_pwhash(
      32,
      password,
      rawSalt,
      publicUser.kdf.time_cost as number,
      publicUser.kdf.memory_cost as number,
      sodium.crypto_pwhash_ALG_DEFAULT
    );

    if (typeof passwordCache !== "undefined") {
      passwordCache.pastPassword = {
        derived: rawDerivedKey,
        raw: password
      };
    }
  }

  if (publicUser.otp_completed && !otpCode)
    throw new OtpRequiredError();

  yield "Seeding auth keypair";

  const rawAuthKeys = signatures.seedKeypair(rawDerivedKey);

  yield "Getting data to sign";

  const toProve = await apiClient.account.controllersAccountEmailToSignToSign(
    email
  );

  yield "Sending signed data to server";

  let loggedInUser: UserJtiModel;
  try {
    loggedInUser = await apiClient.account.controllersAccountEmailLoginLogin(
      captchaToken as string,
      email,
      {
        _id: toProve._id,
        signature: signatures.sign(rawAuthKeys.privateKey, toProve.to_sign),
      },
      otpCode ? otpCode : ""
    );
  } catch (error) {
    throw new LoginError(error.body.detail);
  }

  // Manually defining the whole object, must
  // be in the same order as the createUser var
  // for hashes to match.
  const accountUnsigned = JSON.stringify({
    email: email,
    kdf: {
      time_cost: loggedInUser.user.kdf.time_cost,
      memory_cost: loggedInUser.user.kdf.memory_cost,
      salt: loggedInUser.user.kdf.salt,
    },
    keychain: {
      iv: loggedInUser.user.keychain.iv,
      cipher_text: loggedInUser.user.keychain.cipher_text,
    },
    auth: {
      // Should never be loaded from the server.
      public_key: base64Encode(rawAuthKeys.publicKey),
    },
    keypair: {
      cipher_text: loggedInUser.user.keypair.cipher_text,
      iv: loggedInUser.user.keypair.iv,
      public_key: loggedInUser.user.keypair.public_key,
    },
    signature: "",
  } as CreateUserModel);

  yield "Validating signature";

  try {
    signatures.validateHash(rawAuthKeys.publicKey, loggedInUser.user.signature, accountUnsigned);
  } catch (error) {
    throw new LoginError(error.message);
  }

  yield "Decrypting keychain";

  const rawKeychain = secretKey.decrypt(
    rawDerivedKey,
    loggedInUser.user.keychain.iv,
    loggedInUser.user.keychain.cipher_text
  );

  yield "Decrypting private key";

  const rawKeypairPrivateKey = secretKey.decrypt(
    rawKeychain as Uint8Array,
    loggedInUser.user.keypair.iv,
    loggedInUser.user.keypair.cipher_text
  );

  emailVerificationRequired.set(!loggedInUser.user.email_verified);

  await setLocalSecrets({
    email: loggedInUser.user.email,
    userId: loggedInUser.user._id,
    rawKeychain: base64Encode(rawKeychain),
    rawKeypair: {
      privateKey: base64Encode(rawKeypairPrivateKey),
      publicKey: loggedInUser.user.keypair.public_key,
    },
    jti: loggedInUser.jti,
  });

  yield loggedInUser.user;
}

export async function* register(email: string, password: string, captchaToken?: string, ipConsent: boolean = false) {
  if (captchaToken === "" && import.meta.env.VITE_MCAPTCHA_ENABLED === "true") {
    throw new RegisterError("Captcha not completed");
  }

  yield "Checking password strength";

  if (zxcvbn(password).score < 3) {
    throw new RegisterError("Please use a stronger password");
  }

  yield "Checking if email is taken";

  try {
    await apiClient.account.controllersAccountEmailPublicPublic(email);
    throw new RegisterError("Email taken");
  } catch (error) {
    if (error instanceof RegisterError) {
      throw error;
    }
  }

  yield "Generating salt";

  const rawSalt = sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES);

  const kdf = {
    salt: base64Encode(rawSalt),
    time_cost: sodium.crypto_pwhash_OPSLIMIT_SENSITIVE,
    memory_cost: sodium.crypto_pwhash_MEMLIMIT_SENSITIVE,
  };

  yield "Deriving key from password.";

  const rawDerivedKey = sodium.crypto_pwhash(
    32,
    password,
    rawSalt,
    kdf.time_cost,
    kdf.memory_cost,
    sodium.crypto_pwhash_ALG_DEFAULT
  );

  yield "Seeding auth keypair";

  const rawAuthKeys = signatures.seedKeypair(rawDerivedKey);

  yield "Generating keychain";

  const rawKeychain = secretKey.generateKey();

  const safeKeychain = secretKey.encrypt(
    rawDerivedKey,
    rawKeychain
  );

  yield "Generating keypair";

  const rawKeypair = sodium.crypto_box_keypair();

  const safePrivateKey = secretKey.encrypt(
    rawKeychain,
    rawKeypair.privateKey
  );

  const createUser: CreateUserModel = {
    email: email,
    kdf: {
      time_cost: kdf.time_cost,
      memory_cost: kdf.memory_cost,
      salt: kdf.salt,
    },
    keychain: {
      iv: safeKeychain.iv,
      cipher_text: safeKeychain.cipherText,
    },
    auth: {
      public_key: base64Encode(rawAuthKeys.publicKey),
    },
    keypair: {
      cipher_text: safePrivateKey.cipherText,
      iv: safePrivateKey.iv,
      public_key: base64Encode(rawKeypair.publicKey),
    },
    signature: "",
  };

  yield "Signing user data";

  createUser.signature = signatures.signHash(
    rawAuthKeys.privateKey,
    JSON.stringify(createUser)
  );

  createUser.ip_lookup_consent = ipConsent;

  yield "Sending account data to server";

  try {
    await apiClient.account.controllersAccountCreateCreateAccount(
      captchaToken as string,
      createUser
    );
  } catch (error) {
    throw new RegisterError(error.body.detail);
  }
}

export default {
  logout,
  register,
  login
};
