"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@/lib/nav";
import {
  ArrowLeft,
  Boxes,
  Briefcase,
  CheckCircle2,
  FileUp,
  IdCard,
  Mail,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { useState } from "react";
import { AddressInput } from "@/components/tamp/AddressInput";
import { sendVerificationCode } from "@/fns/email";
import { registerParty } from "@/fns/parties";
import { checkSaMobile } from "@/lib/phone";
import type { BodyType, OnboardingUserType, Place } from "@/lib/tamp-types";

const PROVINCES = ["GP", "KZN", "WC", "EC", "FS", "NW", "LP", "MP", "NC"];
const BUSINESS_TYPES = ["Pty Ltd", "Close Corporation", "Sole Proprietor", "Partnership", "Other"];

// Verification documents (BRS D1 §7.1 / step 03).
const BASE_DOCS = [
  "CIPC registration",
  "Tax clearance",
  "Proof of address",
  "Bank confirmation",
  "Transport / insurance",
];
const CARRIER_DOCS = [
  "Vehicle registration",
  "Operating licence",
  "Roadworthy certificate",
  "Insurance certificate",
];
const BROKER_DOCS = ["Broker mandate", "Commission / FSP agreement"];
// Individual truck-driver documents (Uber/Bolt-style driver verification).
const DRIVER_DOCS = [
  "South African ID / passport",
  "Driver's licence (front & back)",
  "Professional Driving Permit (PrDP)",
  "Proof of address",
  "Profile photo",
];
// Vehicle verification — only an owner-operator supplies these (a fleet driver's
// vehicle is verified by the fleet).
const DRIVER_VEHICLE_DOCS = [
  "Vehicle licence disc (registration)",
  "Roadworthy certificate",
  "Vehicle insurance certificate",
];

// Truck categories a driver can operate — the "what do you drive?" step,
// modelled on how Uber/Bolt let a driver pick their vehicle class.
const TRUCK_CLASSES: { key: string; label: string; desc: string }[] = [
  { key: "LIGHT", label: "Light delivery", desc: "LDV / panel van · up to 1.5t" },
  { key: "MEDIUM", label: "Medium rigid", desc: "4–10t rigid truck" },
  { key: "HEAVY", label: "Heavy rigid", desc: "10–16t rigid truck" },
  { key: "SUPERLINK", label: "Truck-tractor", desc: "Interlink / superlink · 16t+" },
  { key: "SPECIALISED", label: "Specialised", desc: "Reefer · tanker · flatbed · abnormal" },
];
// SA driving-licence codes valid for goods vehicles.
const LICENCE_CODES = ["C1", "C", "EC1", "EC"];
const BODY_TYPES: BodyType[] = [
  "TAUTLINER",
  "FLATBED",
  "TIPPER",
  "TANKER",
  "REFRIGERATED",
  "SIDE_TIPPER",
  "LOWBED",
  "DROPSIDE",
];

// Password strength — scored 0–4 on length + character variety.
interface PwStrength {
  score: number; // 0..4
  label: string;
  tone: string; // bar colour
  hints: string[]; // what's still missing
}
function passwordStrength(pw: string): PwStrength {
  const checks = {
    length: pw.length >= 8,
    lower: /[a-z]/.test(pw),
    upper: /[A-Z]/.test(pw),
    digit: /\d/.test(pw),
    symbol: /[^A-Za-z0-9]/.test(pw),
  };
  let score = Object.values(checks).filter(Boolean).length;
  // Very short passwords can never score well.
  if (pw.length < 8) score = Math.min(score, 1);
  score = Math.max(0, score - 1); // map 0..5 checks → 0..4
  const meta: { label: string; tone: string }[] = [
    { label: "Too weak", tone: "bg-danger" },
    { label: "Weak", tone: "bg-danger" },
    { label: "Fair", tone: "bg-signal" },
    { label: "Good", tone: "bg-signal" },
    { label: "Strong", tone: "bg-positive" },
  ];
  const hints: string[] = [];
  if (!checks.length) hints.push("8+ characters");
  if (!checks.upper) hints.push("an uppercase letter");
  if (!checks.digit) hints.push("a number");
  if (!checks.symbol) hints.push("a symbol");
  return { score, label: meta[score]!.label, tone: meta[score]!.tone, hints };
}

function PasswordMeter({ password }: { password: string }) {
  if (!password) return null;
  const s = passwordStrength(password);
  return (
    <div className="mt-1.5">
      <div className="flex gap-1" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full ${i < s.score ? s.tone : "bg-steel/50"}`}
          />
        ))}
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-[10px]">
        <span className="font-semibold text-muted-foreground">{s.label}</span>
        {s.hints.length > 0 && (
          <span className="truncate text-muted-foreground">Add {s.hints.slice(0, 2).join(", ")}</span>
        )}
      </div>
    </div>
  );
}

// Phone field with live South African mobile-number validation (format only —
// confirms it's a real SA number, not random digits).
function PhoneField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const check = checkSaMobile(value);
  const show = value.trim().length > 0;
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">
        Mobile number
      </label>
      <div className="relative">
        <input
          type="tel"
          inputMode="tel"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="082 123 4567"
          aria-invalid={show && !check.valid}
          className={`w-full rounded-md border bg-graphite px-3 py-2 pr-9 text-sm outline-none focus:border-signal ${
            show && !check.valid ? "border-danger" : "border-border"
          }`}
        />
        {show && check.valid && (
          <CheckCircle2 className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-positive" />
        )}
      </div>
      {show && !check.valid && (
        <p className="mt-1 text-[11px] font-medium text-danger">
          {check.reason ?? "Enter a valid SA mobile number."}
        </p>
      )}
    </div>
  );
}

const USER_TYPES: {
  value: OnboardingUserType;
  label: string;
  blurb: string;
  icon: typeof Truck;
}[] = [
  {
    value: "CARGO_OWNER",
    label: "Cargo Owner",
    blurb: "I have freight to move.",
    icon: Boxes,
  },
  {
    value: "CARRIER",
    label: "Carrier / Truck Owner",
    blurb: "I operate trucks and haul freight.",
    icon: Truck,
  },
  {
    value: "DRIVER",
    label: "Truck Driver",
    blurb: "I drive trucks — for myself or a fleet.",
    icon: IdCard,
  },
  {
    value: "BROKER",
    label: "Broker / Business",
    blurb: "I broker loads between parties.",
    icon: Briefcase,
  },
];

type Step = "you" | "business" | "vehicle" | "work" | "verification" | "otp" | "done";

function Register() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [userType, setUserType] = useState<OnboardingUserType | null>(null);
  const [step, setStep] = useState<Step>("you");

  const [you, setYou] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    province: "GP",
    password: "",
    confirm: "",
  });
  const [biz, setBiz] = useState({
    companyName: "",
    registrationNumber: "",
    businessType: "Pty Ltd",
    address: "",
    contactDetails: "",
    vat: "",
  });
  const [drv, setDrv] = useState({
    vehicleClasses: [] as string[],
    licenceCode: "EC",
    prdp: false,
    workType: "OWNER" as "OWNER" | "FLEET",
    fleetName: "",
    truckReg: "",
    truckBody: "TAUTLINER" as BodyType,
    capacityT: 34,
  });
  const [drvError, setDrvError] = useState("");
  const [docs, setDocs] = useState<Record<string, string>>({});
  const [addr, setAddr] = useState<Place | null>(null);

  const [codeInput, setCodeInput] = useState("");
  const [otpError, setOtpError] = useState("");
  // Real email verification: the code is generated + checked server-side. In dev
  // (no email provider configured) the server hands the code back to display.
  const [codeSending, setCodeSending] = useState(false);
  const [codeLive, setCodeLive] = useState(false);
  const [devCode, setDevCode] = useState<string | undefined>(undefined);
  const [sendError, setSendError] = useState("");
  const [pwError, setPwError] = useState("");
  const [newId, setNewId] = useState("");

  const isBusiness = userType === "CARRIER" || userType === "BROKER";
  const isDriver = userType === "DRIVER";
  const needsReview = isBusiness || isDriver;
  const lastDataStep: Step = needsReview ? "verification" : "you";
  const docList = isDriver
    ? DRIVER_DOCS.flatMap((d) =>
        // Slot the vehicle docs in before proof of address, for owner-operators.
        d === "Proof of address" && drv.workType === "OWNER" ? [...DRIVER_VEHICLE_DOCS, d] : [d],
      )
    : [
        ...BASE_DOCS,
        ...(userType === "CARRIER" ? CARRIER_DOCS : []),
        ...(userType === "BROKER" ? BROKER_DOCS : []),
      ];

  const register = useMutation({
    mutationFn: () =>
      registerParty({
        data: {
          userType: userType!,
          firstName: you.firstName.trim(),
          lastName: you.lastName.trim(),
          email: you.email.trim(),
          phone: you.phone.trim(),
          province: you.province,
          password: you.password,
          code: codeInput.trim(),
          business: isBusiness
            ? {
                companyName: biz.companyName.trim(),
                registrationNumber: biz.registrationNumber.trim(),
                businessType: biz.businessType,
                address: biz.address.trim(),
                contactDetails: biz.contactDetails.trim(),
                vat: biz.vat.trim(),
              }
            : undefined,
          driver: isDriver
            ? {
                vehicleClasses: drv.vehicleClasses,
                licenceCode: drv.licenceCode,
                prdp: drv.prdp,
                workType: drv.workType,
                ...(drv.workType === "FLEET" ? { fleetName: drv.fleetName.trim() } : {}),
                ...(drv.workType === "OWNER"
                  ? {
                      truck: {
                        registration: drv.truckReg.trim(),
                        bodyType: drv.truckBody,
                        capacityT: drv.capacityT,
                      },
                    }
                  : {}),
              }
            : undefined,
          documents: Object.keys(docs).filter((k) => docs[k]),
        },
      }),
    onSuccess: ({ id }) => {
      queryClient.invalidateQueries({ queryKey: ["parties"] });
      setNewId(id);
      setStep("done");
    },
  });

  // Request a real verification code for the entered email, then show the OTP
  // step. Safe to call again for "Resend".
  const sendCode = async () => {
    setCodeSending(true);
    setSendError("");
    setOtpError("");
    try {
      const res = await sendVerificationCode(you.email.trim());
      setCodeLive(res.live);
      setDevCode(res.devCode);
    } catch (err) {
      setSendError(
        err instanceof Error ? err.message : "Couldn't send the code. Try again.",
      );
    } finally {
      setCodeSending(false);
    }
  };

  const toOtp = () => {
    setCodeInput("");
    setOtpError("");
    setDevCode(undefined);
    setStep("otp");
    void sendCode();
  };

  const submitYou = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordStrength(you.password).score < 2) {
      setPwError("Choose a stronger password — at least 8 characters with a mix of letters and numbers.");
      return;
    }
    if (you.password !== you.confirm) {
      setPwError("Passwords don't match.");
      return;
    }
    if (!checkSaMobile(you.phone).valid) {
      setPwError("Enter a valid South African mobile number.");
      return;
    }
    setPwError("");
    if (isDriver) setStep("vehicle");
    else if (lastDataStep === "you") toOtp();
    else setStep("business");
  };

  const submitBusiness = (e: React.FormEvent) => {
    e.preventDefault();
    setStep("verification");
  };

  const submitVehicle = (e: React.FormEvent) => {
    e.preventDefault();
    if (drv.vehicleClasses.length === 0) {
      setDrvError("Pick at least one truck category you're licensed to drive.");
      return;
    }
    setDrvError("");
    setStep("work");
  };

  const submitWork = (e: React.FormEvent) => {
    e.preventDefault();
    if (!drv.prdp) {
      setDrvError("A valid Professional Driving Permit (PrDP) is required to drive for reward.");
      return;
    }
    if (drv.workType === "OWNER" && !drv.truckReg.trim()) {
      setDrvError("Enter your truck's registration.");
      return;
    }
    if (drv.workType === "FLEET" && !drv.fleetName.trim()) {
      setDrvError("Enter the fleet / operator you drive for.");
      return;
    }
    setDrvError("");
    setStep("verification");
  };

  const toggleClass = (key: string) =>
    setDrv((d) => ({
      ...d,
      vehicleClasses: d.vehicleClasses.includes(key)
        ? d.vehicleClasses.filter((k) => k !== key)
        : [...d.vehicleClasses, key],
    }));

  const submitVerification = (e: React.FormEvent) => {
    e.preventDefault();
    toOtp();
  };

  const verifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    setOtpError("");
    // The server verifies the code as part of registration.
    register.mutate();
  };

  // Left-panel step list.
  const stepList = isDriver
    ? [
        { key: "you", label: "Your details" },
        { key: "vehicle", label: "What you drive" },
        { key: "work", label: "Work setup" },
        { key: "verification", label: "Driver documents" },
        { key: "otp", label: "Verify email" },
        { key: "done", label: "Submitted for review" },
      ]
    : isBusiness
      ? [
          { key: "you", label: "Your details" },
          { key: "business", label: "Your business" },
          { key: "verification", label: "Verification documents" },
          { key: "otp", label: "Verify email" },
          { key: "done", label: "Submitted for review" },
        ]
      : [
          { key: "you", label: "Your details" },
          { key: "otp", label: "Verify email" },
          { key: "done", label: "Account created" },
        ];
  const stepOrder = stepList.map((s) => s.key);
  const currentIdx = stepOrder.indexOf(step);

  return (
    <main className="grid min-h-screen md:grid-cols-2">
      <section className="flex flex-col justify-center border-b border-border bg-graphite p-8 md:border-b-0 md:border-r md:p-14">
        <div className="mb-8 flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-md bg-signal font-extrabold text-signal-foreground">
            T
          </span>
          <span className="text-xl font-extrabold tracking-tight">TAMP</span>
        </div>
        <h1 className="max-w-md text-3xl font-extrabold leading-tight tracking-tight md:text-4xl">
          Join the network.
        </h1>
        <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
          {userType === null
            ? "Choose how you'll use TAMP. Cargo owners get moving in minutes; carriers and brokers complete a short business verification."
            : "Complete each step. Your account is created in a pending state and an administrator verifies it before you can transact."}
        </p>
        {userType !== null && (
          <ol className="mt-8 max-w-md space-y-2 text-xs">
            {stepList.map((s, i) => (
              <StepLine
                key={s.key}
                n={i + 1}
                label={s.label}
                active={step === s.key}
                done={i < currentIdx}
              />
            ))}
          </ol>
        )}
      </section>

      <section className="flex flex-col justify-center p-8 md:p-14">
        {/* Picker */}
        {userType === null && (
          <div className="mx-auto w-full max-w-sm sm:max-w-md lg:max-w-lg space-y-4">
            <div>
              <h2 className="text-lg font-bold tracking-tight">Sign up</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Already registered?{" "}
                <Link to="/" className="font-semibold text-signal hover:underline">
                  Sign in
                </Link>
              </p>
            </div>
            <div className="space-y-2">
              {USER_TYPES.map((u) => (
                <button
                  key={u.value}
                  onClick={() => {
                    setUserType(u.value);
                    setStep("you");
                  }}
                  className="flex w-full items-center gap-3 rounded-md border border-border bg-graphite px-4 py-3 text-left hover:border-signal hover:bg-steel/30"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-md bg-signal/15 text-signal">
                    <u.icon className="size-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold">{u.label}</span>
                    <span className="block text-[11px] text-muted-foreground">{u.blurb}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 01 — You */}
        {userType !== null && step === "you" && (
          <form
            onSubmit={submitYou}
            className="mx-auto w-full max-w-sm sm:max-w-md lg:max-w-lg space-y-4"
          >
            <Header
              title="Your details"
              onBack={() => setUserType(null)}
              backLabel="Change role"
              badge={USER_TYPES.find((u) => u.value === userType)?.label}
            />
            <div className="grid grid-cols-2 gap-3">
              <Field label="First name">
                <input
                  value={you.firstName}
                  onChange={(e) => setYou({ ...you, firstName: e.target.value })}
                  className={inputCls}
                  required
                />
              </Field>
              <Field label="Last name">
                <input
                  value={you.lastName}
                  onChange={(e) => setYou({ ...you, lastName: e.target.value })}
                  className={inputCls}
                  required
                />
              </Field>
            </div>
            <Field label="Email">
              <input
                type="email"
                value={you.email}
                onChange={(e) => setYou({ ...you, email: e.target.value })}
                className={inputCls}
                required
              />
            </Field>
            <PhoneField value={you.phone} onChange={(v) => setYou({ ...you, phone: v })} />
            <Field label="Province">
              <select
                value={you.province}
                onChange={(e) => setYou({ ...you, province: e.target.value })}
                className={inputCls}
              >
                {PROVINCES.map((p) => (
                  <option key={p} value={p} className="bg-graphite">
                    {p}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Password">
                <input
                  type="password"
                  value={you.password}
                  onChange={(e) => setYou({ ...you, password: e.target.value })}
                  className={inputCls}
                  required
                />
                <PasswordMeter password={you.password} />
              </Field>
              <Field label="Confirm password">
                <input
                  type="password"
                  value={you.confirm}
                  onChange={(e) => setYou({ ...you, confirm: e.target.value })}
                  className={inputCls}
                  required
                />
              </Field>
            </div>
            {pwError && <p className="text-xs font-medium text-danger">{pwError}</p>}
            <button type="submit" className={btnCls}>
              {lastDataStep === "you" ? "Continue to email verification" : "Continue"}
            </button>
          </form>
        )}

        {/* 02 — Your Business */}
        {step === "business" && (
          <form
            onSubmit={submitBusiness}
            className="mx-auto w-full max-w-sm sm:max-w-md lg:max-w-lg space-y-4"
          >
            <Header title="Your business" onBack={() => setStep("you")} backLabel="Back" />
            <Field label="Company / trading name">
              <input
                value={biz.companyName}
                onChange={(e) => setBiz({ ...biz, companyName: e.target.value })}
                className={inputCls}
                required
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Registration number">
                <input
                  value={biz.registrationNumber}
                  onChange={(e) => setBiz({ ...biz, registrationNumber: e.target.value })}
                  className={inputCls}
                  placeholder="2019/123456/07"
                />
              </Field>
              <Field label="Business type">
                <select
                  value={biz.businessType}
                  onChange={(e) => setBiz({ ...biz, businessType: e.target.value })}
                  className={inputCls}
                >
                  {BUSINESS_TYPES.map((t) => (
                    <option key={t} value={t} className="bg-graphite">
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Business address">
              <AddressInput
                value={addr}
                onSelect={(p) => {
                  setAddr(p);
                  setBiz({ ...biz, address: p.label });
                }}
                placeholder="Search your business address…"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Contact details">
                <input
                  value={biz.contactDetails}
                  onChange={(e) => setBiz({ ...biz, contactDetails: e.target.value })}
                  className={inputCls}
                  placeholder="Office phone / email"
                />
              </Field>
              <Field label="VAT number">
                <input
                  value={biz.vat}
                  onChange={(e) => setBiz({ ...biz, vat: e.target.value })}
                  className={inputCls}
                  placeholder="4xxxxxxxxx"
                />
              </Field>
            </div>
            <button type="submit" className={btnCls}>
              Continue to verification
            </button>
          </form>
        )}

        {/* Driver — What you drive */}
        {step === "vehicle" && (
          <form
            onSubmit={submitVehicle}
            className="mx-auto w-full max-w-sm sm:max-w-md lg:max-w-lg space-y-4"
          >
            <Header title="What do you drive?" onBack={() => setStep("you")} backLabel="Back" />
            <p className="text-[11px] text-muted-foreground">
              Select every truck category you're licensed and experienced to operate. You'll be
              matched to loads that fit.
            </p>
            <div className="space-y-2">
              {TRUCK_CLASSES.map((c) => {
                const on = drv.vehicleClasses.includes(c.key);
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => toggleClass(c.key)}
                    className={`flex w-full items-center gap-3 rounded-md border px-4 py-3 text-left ${
                      on
                        ? "border-signal bg-signal/10"
                        : "border-border bg-graphite hover:border-signal/50"
                    }`}
                  >
                    <span
                      className={`grid size-9 shrink-0 place-items-center rounded-md ${
                        on ? "bg-signal/20 text-signal" : "bg-steel/50 text-muted-foreground"
                      }`}
                    >
                      <Truck className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold">{c.label}</span>
                      <span className="block text-[11px] text-muted-foreground">{c.desc}</span>
                    </span>
                    <span
                      className={`grid size-5 place-items-center rounded-full border ${
                        on ? "border-signal bg-signal text-signal-foreground" : "border-border"
                      }`}
                    >
                      {on && <CheckCircle2 className="size-4" />}
                    </span>
                  </button>
                );
              })}
            </div>
            <Field label="Driving licence code">
              <select
                value={drv.licenceCode}
                onChange={(e) => setDrv({ ...drv, licenceCode: e.target.value })}
                className={inputCls}
              >
                {LICENCE_CODES.map((c) => (
                  <option key={c} value={c} className="bg-graphite">
                    Code {c}
                  </option>
                ))}
              </select>
            </Field>
            {drvError && <p className="text-xs font-medium text-danger">{drvError}</p>}
            <button type="submit" className={btnCls}>
              Continue
            </button>
          </form>
        )}

        {/* Driver — Work setup */}
        {step === "work" && (
          <form
            onSubmit={submitWork}
            className="mx-auto w-full max-w-sm sm:max-w-md lg:max-w-lg space-y-4"
          >
            <Header title="How do you work?" onBack={() => setStep("vehicle")} backLabel="Back" />
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { key: "OWNER", label: "I own my truck", desc: "Owner-operator" },
                  { key: "FLEET", label: "I drive for a fleet", desc: "Employed driver" },
                ] as const
              ).map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setDrv({ ...drv, workType: o.key })}
                  className={`rounded-md border px-3 py-3 text-left ${
                    drv.workType === o.key
                      ? "border-signal bg-signal/10"
                      : "border-border bg-graphite hover:border-signal/50"
                  }`}
                >
                  <span className="block text-sm font-bold">{o.label}</span>
                  <span className="block text-[11px] text-muted-foreground">{o.desc}</span>
                </button>
              ))}
            </div>

            {drv.workType === "OWNER" ? (
              <div className="space-y-3 rounded-md border border-dashed border-border p-3">
                <Field label="Truck registration">
                  <input
                    value={drv.truckReg}
                    onChange={(e) => setDrv({ ...drv, truckReg: e.target.value.toUpperCase() })}
                    className={inputCls}
                    placeholder="e.g. CA 123-456"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Body type">
                    <select
                      value={drv.truckBody}
                      onChange={(e) => setDrv({ ...drv, truckBody: e.target.value as BodyType })}
                      className={inputCls}
                    >
                      {BODY_TYPES.map((b) => (
                        <option key={b} value={b} className="bg-graphite">
                          {b.replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Payload (t)">
                    <input
                      type="number"
                      value={drv.capacityT}
                      onChange={(e) => setDrv({ ...drv, capacityT: Number(e.target.value) })}
                      className={inputCls}
                    />
                  </Field>
                </div>
              </div>
            ) : (
              <Field label="Fleet / operator you drive for">
                <input
                  value={drv.fleetName}
                  onChange={(e) => setDrv({ ...drv, fleetName: e.target.value })}
                  className={inputCls}
                  placeholder="Company name or fleet code"
                />
              </Field>
            )}

            <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border bg-graphite px-3 py-2.5">
              <input
                type="checkbox"
                checked={drv.prdp}
                onChange={(e) => setDrv({ ...drv, prdp: e.target.checked })}
                className="mt-0.5 size-4 accent-signal"
              />
              <span className="text-xs">
                <span className="font-semibold text-foreground">
                  I hold a valid Professional Driving Permit (PrDP).
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  Required in South Africa to transport goods for reward.
                </span>
              </span>
            </label>

            {drvError && <p className="text-xs font-medium text-danger">{drvError}</p>}
            <button type="submit" className={btnCls}>
              Continue to documents
            </button>
          </form>
        )}

        {/* 03 — Verification */}
        {step === "verification" && (
          <form
            onSubmit={submitVerification}
            className="mx-auto w-full max-w-sm sm:max-w-md lg:max-w-lg space-y-4"
          >
            <Header
              title={isDriver ? "Driver documents" : "Verification documents"}
              onBack={() => setStep(isDriver ? "work" : "business")}
              backLabel="Back"
            />
            <p className="text-[11px] text-muted-foreground">
              Upload the documents below.{" "}
              {isDriver
                ? drv.workType === "OWNER"
                  ? "Drivers must supply ID, licence, PrDP and their vehicle documents (licence disc, roadworthy and insurance) for a background check."
                  : "Drivers must supply ID, licence and a valid PrDP for a background check."
                : userType === "CARRIER"
                  ? "Carriers must also supply vehicle, licence, roadworthy and insurance documents."
                  : "Brokers must also supply mandate and commission documents."}{" "}
              Demo only — files aren't stored; filenames are recorded for the queue.
            </p>
            <div className="space-y-2">
              {docList.map((label) => (
                <DocUpload
                  key={label}
                  label={label}
                  value={docs[label]}
                  onChange={(name) => setDocs((d) => ({ ...d, [label]: name }))}
                />
              ))}
            </div>
            <button type="submit" className={btnCls}>
              Continue to email verification
            </button>
          </form>
        )}

        {/* Verify email */}
        {step === "otp" && (
          <form
            onSubmit={verifyOtp}
            className="mx-auto w-full max-w-sm sm:max-w-md lg:max-w-lg space-y-4"
          >
            <div className="text-center">
              <Mail className="mx-auto mb-2 size-10 text-signal" />
              <h2 className="text-lg font-bold tracking-tight">Verify your email</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {codeSending ? (
                  "Sending a 6-digit code…"
                ) : (
                  <>
                    We emailed a 6-digit code to{" "}
                    <span className="font-semibold text-foreground">{you.email}</span>.
                  </>
                )}
              </p>
            </div>
            {sendError && (
              <div className="rounded-md border border-danger/50 bg-danger/5 px-3 py-2 text-center text-[11px] text-danger">
                {sendError}
              </div>
            )}
            {/* Dev only: no email provider configured, so show the code here. */}
            {devCode && (
              <div className="rounded-md border border-dashed border-signal/50 bg-signal/5 px-3 py-2 text-center text-[11px] text-muted-foreground">
                Dev mode — no email provider set. Your code is{" "}
                <span className="font-mono text-base font-bold tracking-widest text-foreground">
                  {devCode}
                </span>
              </div>
            )}
            <Field label="Enter the 6-digit code">
              <input
                inputMode="numeric"
                maxLength={6}
                value={codeInput}
                onChange={(e) => {
                  setCodeInput(e.target.value.replace(/\D/g, ""));
                  setOtpError("");
                }}
                placeholder="000000"
                className={`${inputCls} text-center font-mono text-lg tracking-[0.4em]`}
                autoFocus
              />
            </Field>
            {otpError && <p className="text-xs font-medium text-danger">{otpError}</p>}
            {register.isError && (
              <p className="text-xs font-medium text-danger">
                {register.error instanceof Error
                  ? register.error.message
                  : "Registration failed. Please try again."}
              </p>
            )}
            <button
              type="submit"
              disabled={codeInput.length !== 6 || register.isPending}
              className={`${btnCls} disabled:opacity-50`}
            >
              {register.isPending ? "Submitting…" : "Verify & submit"}
            </button>
            <div className="flex items-center justify-between text-[11px]">
              <button
                type="button"
                onClick={() => setStep(lastDataStep)}
                className="font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
              >
                ← Edit details
              </button>
              <button
                type="button"
                disabled={codeSending}
                onClick={() => {
                  setCodeInput("");
                  void sendCode();
                }}
                className="font-semibold uppercase tracking-wide text-signal hover:underline disabled:opacity-50"
              >
                {codeSending ? "Sending…" : "Resend code"}
              </button>
            </div>
          </form>
        )}

        {/* Submitted */}
        {step === "done" && (
          <div className="mx-auto w-full max-w-sm sm:max-w-md lg:max-w-lg space-y-4 text-center">
            <div className="flex flex-col items-center gap-2">
              <ShieldCheck className="size-12 text-positive" />
              <span className="inline-flex items-center gap-1 rounded-full bg-positive/15 px-2 py-0.5 text-[10px] font-bold uppercase text-positive">
                <CheckCircle2 className="size-3" /> Email verified
              </span>
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight">
                {needsReview ? "Application submitted" : "Account created"}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {isDriver
                  ? "Your driver application has been submitted for verification. We'll notify you once your documents are approved and you can start accepting jobs."
                  : isBusiness
                    ? "Your business information has been submitted for verification. We'll notify you once your account has been approved."
                    : "Your account has been created and is pending verification."}{" "}
                Reference <span className="font-mono text-foreground">{newId}</span>.
              </p>
            </div>
            <Link to="/" className={btnCls + " inline-block"}>
              Back to sign in
            </Link>
            <button
              onClick={() => navigate({ to: "/admin/users" })}
              className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
            >
              View the admin verification queue
            </button>
          </div>
        )}
      </section>
    </main>
  );
}

const inputCls =
  "w-full rounded-md border border-border bg-graphite px-3 py-2.5 text-sm text-foreground outline-none focus:border-signal";
const btnCls =
  "w-full rounded-md bg-signal py-2.5 text-sm font-bold uppercase tracking-wide text-signal-foreground hover:brightness-105";

function Header({
  title,
  onBack,
  backLabel,
  badge,
}: {
  title: string;
  onBack: () => void;
  backLabel: string;
  badge?: string | undefined;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-2 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3" /> {backLabel}
      </button>
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-bold tracking-tight">{title}</h2>
        {badge && (
          <span className="rounded-full bg-steel px-2 py-0.5 text-[9px] font-bold uppercase text-muted-foreground">
            {badge}
          </span>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function DocUpload({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | undefined;
  onChange: (name: string) => void;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2 text-xs ${
        value ? "border-positive text-foreground" : "border-border text-muted-foreground"
      }`}
    >
      {value ? (
        <CheckCircle2 className="size-4 shrink-0 text-positive" />
      ) : (
        <FileUp className="size-4 shrink-0" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{label}</span>
        {value && <span className="block truncate text-[10px] text-muted-foreground">{value}</span>}
      </span>
      <input
        type="file"
        accept=".pdf,.png,.jpg,.jpeg"
        onChange={(e) => onChange(e.target.files?.[0]?.name ?? "")}
        className="hidden"
      />
    </label>
  );
}

function StepLine({
  n,
  label,
  active,
  done,
}: {
  n: number;
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <li className="flex items-center gap-2">
      <span
        className={`grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${
          done
            ? "bg-positive text-background"
            : active
              ? "bg-signal text-signal-foreground"
              : "bg-steel text-muted-foreground"
        }`}
      >
        {done ? "✓" : n}
      </span>
      <span className={active ? "text-foreground" : "text-muted-foreground"}>{label}</span>
    </li>
  );
}

export default Register;
