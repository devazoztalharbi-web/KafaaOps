"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { can, login, revoke, sessionUser } from "@/lib/auth";
import { sha256 } from "@/lib/crypto";
import { enrollFace, matchFace } from "@/lib/face";
import { parseScheduleCsv, saveSchedule } from "@/lib/payroll";
import { companyChains, createLeave, decideLeave, recordArrival, recordPunch, setSiteFence } from "@/lib/ops";
import { cancelTask, closeTask, createTask, submitTask, suspendEmployee } from "@/lib/tasks";
import { acknowledgeAlert, addBan, addVehicle, cancelCustody, checkPermit, grantAlertClose, openAlerts, raiseAlert, receiveCustody, recordVehicleIn, returnRadio, revokeAlertClose, startCustody } from "@/lib/field";
import { addPoint, directPerson } from "@/lib/posts";
import { approveJoin, grantJoinApproval, rejectJoin, requestJoin, revokeJoinApproval } from "@/lib/join";

async function token() {
  const jar = await cookies();
  return jar.get("kafaa_session")?.value;
}

export async function currentUser() {
  return sessionUser(await token());
}

export async function loginAction(formData: FormData) {
  const headerList = await headers();
  const result = login(String(formData.get("email") ?? ""), String(formData.get("password") ?? ""), {
    ip: headerList.get("x-forwarded-for") ?? "local",
    userAgent: headerList.get("user-agent") ?? "",
  });
  if ("error" in result) redirect(`/enter?e=${result.error}`);
  const jar = await cookies();
  jar.set("kafaa_session", result.token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 12 });
  redirect("/app");
}

export async function logoutAction() {
  revoke(await token());
  const jar = await cookies();
  jar.delete("kafaa_session");
  redirect("/");
}

export async function leaveAction(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/enter");
  const file = formData.get("file");
  const bytes = file instanceof File && file.size ? new Uint8Array(await file.arrayBuffer()) : undefined;
  const result = createLeave(user, {
    type: String(formData.get("type") ?? ""),
    start: String(formData.get("start") ?? ""),
    end: String(formData.get("end") ?? ""),
    reason: String(formData.get("reason") ?? ""),
    file: bytes,
    fileName: file instanceof File ? file.name : undefined,
  });
  redirect(`/app/leaves?e=${"error" in result ? result.error : "ok"}`);
}

export async function decideAction(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/enter");
  const decision = String(formData.get("decision") ?? "");
  if (decision !== "APPROVE" && decision !== "REJECT") redirect("/app/leaves?e=err_permission");
  const result = decideLeave(user, String(formData.get("id") ?? ""), decision, String(formData.get("note") ?? ""));
  redirect(`/app/leaves?e=${"error" in result ? result.error : "ok"}`);
}

export async function faceAction(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/enter");
  const frames = await Promise.all(
    formData.getAll("frame").flatMap((item) => (item instanceof File && item.size > 0 ? [item.arrayBuffer().then((buffer) => new Uint8Array(buffer))] : [])),
  );
  const mode = String(formData.get("mode") ?? "");
  if (mode === "enroll") {
    const result = await enrollFace(user.id, user.companyId, frames);
    redirect(`/app/attendance?e=${"error" in result ? result.error : "enrolled"}`);
  }
  const matched = await matchFace(user.id, frames);
  if ("error" in matched) redirect(`/app/attendance?e=${matched.error}`);
  const kind = String(formData.get("kind") ?? "");
  if (kind !== "IN" && kind !== "OUT" && kind !== "CHECK") redirect("/app/attendance?e=err_permission");
  const headerList = await headers();
  const result = recordPunch(user, {
    siteId: String(formData.get("siteId") ?? ""),
    kind,
    lat: Number(formData.get("lat")),
    lng: Number(formData.get("lng")),
    accuracy: Number(formData.get("accuracy")),
    clientTime: new Date().toISOString(),
    userAgent: headerList.get("user-agent") ?? "",
    integrity: null,
    imageSha: sha256(Buffer.concat(frames.map((frame) => Buffer.from(frame)))),
    faceProof: matched.proof,
  });
  redirect(`/app/attendance?e=${"error" in result ? result.error : "punched"}`);
}

export async function arrivalAction(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/enter");
  const file = formData.get("photo");
  const result = recordArrival(user, {
    lat: Number(formData.get("lat")),
    lng: Number(formData.get("lng")),
    accuracy: Number(formData.get("accuracy")),
    photo: file instanceof File && file.size > 0 ? new Uint8Array(await file.arrayBuffer()) : undefined,
  });
  redirect(`/app/attendance?e=${"error" in result ? result.error : "arrived"}`);
}

export async function fenceAction(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/enter");
  const result = setSiteFence(user, {
    siteId: String(formData.get("siteId") ?? ""),
    lat: Number(formData.get("lat")),
    lng: Number(formData.get("lng")),
    radius: Number(formData.get("radius")),
  });
  redirect(`/app?e=${"error" in result ? result.error : "ok"}`);
}

export async function scheduleAction(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/enter");
  const entries = [...formData.entries()]
    .filter(([key]) => key.startsWith("day:"))
    .map(([key, value]) => ({ date: key.slice(4), kind: String(value) }));
  const file = formData.get("csv");
  if (file instanceof File && file.size > 0 && file.size < 100_000) {
    entries.push(...parseScheduleCsv(await file.text()));
  }
  const result = saveSchedule(user, String(formData.get("userId") ?? ""), entries);
  const target = String(formData.get("userId") ?? "");
  redirect(`/app/schedule?user=${target}&e=${"error" in result ? "err" : "ok"}`);
}

export async function taskAction(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/enter");
  const mode = String(formData.get("mode") ?? "");
  const id = String(formData.get("id") ?? "");
  const result =
    mode === "create"
      ? createTask(user, { guardId: String(formData.get("guardId") ?? ""), siteId: String(formData.get("siteId") ?? ""), dutyDate: String(formData.get("dutyDate") ?? "") })
      : mode === "submit"
        ? submitTask(user, id)
        : mode === "close"
          ? closeTask(user, id, Number(formData.get("rating")), String(formData.get("note") ?? ""))
          : mode === "cancel"
            ? cancelTask(user, id)
            : mode === "suspend"
              ? suspendEmployee(user, String(formData.get("userId") ?? ""))
              : { error: "err_permission" as const };
  redirect(`/app/tasks?e=${"error" in result ? result.error : "ok"}`);
}

async function photo(value: FormDataEntryValue | null) {
  if (!(value instanceof File) || value.size === 0) return undefined;
  return new Uint8Array(await value.arrayBuffer());
}

export async function custodyAction(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/enter");
  const mode = String(formData.get("mode") ?? "");
  const result =
    mode === "choose"
      ? startCustody(user, { kind: String(formData.get("kind") ?? "") === "VEHICLE" ? "VEHICLE" : "RADIO", vehicleId: String(formData.get("vehicleId") ?? "") })
      : mode === "cancel"
            ? cancelCustody(user, String(formData.get("directionId") ?? ""))
            : mode === "receive"
              ? receiveCustody(user, {
                  deviceNo: String(formData.get("deviceNo") ?? ""),
                  radioPhoto: await photo(formData.get("radioPhoto")),
                  vehicleId: String(formData.get("vehicleId") ?? ""),
                  km: Number(formData.get("km")),
                  outside: await photo(formData.get("photo")),
                  inside: await photo(formData.get("photo2")),
                  odometer: await photo(formData.get("odometer")),
                })
              : mode === "radio-in"
        ? returnRadio(user, { deviceNo: String(formData.get("deviceNo") ?? ""), photo: await photo(formData.get("photo")) })
        : mode === "vehicle"
          ? addVehicle(user, { code: String(formData.get("code") ?? ""), label: String(formData.get("label") ?? "") })
          : mode === "in"
              ? recordVehicleIn(user, {
                  vehicleId: String(formData.get("vehicleId") ?? ""),
                  km: Number(formData.get("km")),
                  fuel: String(formData.get("fuel") ?? ""),
                  odometer: await photo(formData.get("odometer")),
                  fuelPhoto: await photo(formData.get("fuelPhoto")),
                })
              : { error: "err_permission" as const };
  redirect(`/app/custody?e=${"error" in result ? result.error : "ok"}`);
}

export async function permitAction(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/enter");
  const result = checkPermit(user, {
    shopName: String(formData.get("shopName") ?? ""),
    registrationNo: String(formData.get("registrationNo") ?? ""),
    validUntil: String(formData.get("validUntil") ?? ""),
  });
  if ("error" in result) redirect(`/app/permits?e=${result.error}`);
  redirect(`/app/permits?e=${result.banned && result.expired ? "both" : result.banned ? "banned" : result.expired ? "expired" : "ok"}`);
}

export async function banAction(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/enter");
  const result = addBan(user, {
    registrationNo: String(formData.get("registrationNo") ?? ""),
    name: String(formData.get("name") ?? ""),
    reason: String(formData.get("reason") ?? ""),
  });
  redirect(`/app/permits?e=${"error" in result ? result.error : "ok"}`);
}

export async function raiseAlertAction(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/enter");
  const result = raiseAlert(user, { kind: String(formData.get("kind") ?? ""), body: String(formData.get("body") ?? "") });
  redirect(`/app/alerts?e=${"error" in result ? result.error : "ok"}`);
}

export async function listAlerts() {
  const user = await currentUser();
  if (!user?.companyId) return [];
  return openAlerts(user.companyId);
}

export async function joinAction(formData: FormData) {
  const result = requestJoin({
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    joinCode: String(formData.get("joinCode") ?? ""),
  });
  redirect(`/join?e=${"error" in result ? result.error : "ok"}`);
}

export async function reviewJoinAction(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/enter");
  const mode = String(formData.get("mode") ?? "");
  const result = mode === "reject"
    ? rejectJoin(user, String(formData.get("userId") ?? ""))
    : mode === "grant" || mode === "revoke"
      ? (mode === "revoke" ? revokeJoinApproval : grantJoinApproval)(user, String(formData.get("userId") ?? ""))
      : approveJoin(user, {
          userId: String(formData.get("userId") ?? ""),
          siteId: String(formData.get("siteId") ?? ""),
          shiftNo: Number(formData.get("shiftNo")),
          managerId: String(formData.get("managerId") ?? ""),
        });
  redirect(`/app/people?e=${"error" in result ? result.error : "ok"}`);
}

export async function pointAction(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/enter");
  const result = addPoint(user, String(formData.get("siteId") ?? ""), String(formData.get("label") ?? ""));
  redirect(`/app?e=${"error" in result ? result.error : "ok"}`);
}

export async function directAction(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/enter");
  const result = directPerson(user, String(formData.get("userId") ?? ""), String(formData.get("pointId") ?? ""));
  redirect(`/app?e=${"error" in result ? result.error : "ok"}`);
}

export async function grantAlertAction(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/enter");
  const target = String(formData.get("userId") ?? "");
  const result = String(formData.get("mode") ?? "") === "revoke" ? revokeAlertClose(user, target) : grantAlertClose(user, target);
  redirect(`/app/alerts?e=${"error" in result ? result.error : "ok"}`);
}

export async function acknowledgeAction(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/enter");
  acknowledgeAlert(user, String(formData.get("id") ?? ""));
  redirect("/app");
}

export async function chainsAction() {
  const user = await currentUser();
  if (!user?.companyId || !can(user, "audit")) return null;
  return companyChains(user.companyId);
}
