# -*- coding: utf-8 -*-
"""生产环境演示数据种子脚本（经 admin-api GraphQL，tcm 操作全部内联参数）
前置：SSO 已有 etao(superadmin 绑定) 与 dao(txting@163.com) 两个账号。
执行：python3 tcm_seed.py
"""
import json
import re
import urllib.request
from datetime import datetime, timedelta

ADMIN_API = "http://127.0.0.1:3020/admin-api"
SSO_LOGIN = "http://127.0.0.1:1337/api/zhao-sso/v1/auth/login"
PASSWORD = "a963963"


def http_json(url, payload, token=None):
    req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), method="POST")
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            body = json.loads(res.read().decode("utf-8"))
            return body, dict(res.headers)
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code}: {e.read().decode('utf-8', 'ignore')[:400]}")


def gql(token, query, variables=None):
    body, headers = http_json(ADMIN_API, {"query": query, "variables": variables or {}}, token)
    if body.get("errors"):
        raise RuntimeError(f"GraphQL error: {json.dumps(body['errors'], ensure_ascii=False)[:500]}")
    return body["data"]


def inline(obj):
    """json 值内联进 GraphQL 查询（键名去引号，字符串值保留引号）"""
    s = json.dumps(obj, ensure_ascii=False)
    return re.sub(r'"([A-Za-z_][A-Za-z0-9_]*)"\s*:', r'\1:', s)


def sso_token(identifier):
    body, _ = http_json(SSO_LOGIN, {
        "data": {"type": "password", "identifier": identifier,
                 "password": PASSWORD, "app_code": "tcm-workbench"}})
    return body["access_token"]


def vendure_session(sso_access_token):
    q = "mutation($a: AuthenticationInput!) { authenticate(input: $a) { ... on CurrentUser { id identifier } ... on ErrorResult { errorCode message } } }"
    body, headers = http_json(ADMIN_API, {"query": q, "variables": {"a": {"tcmSso": {"accessToken": sso_access_token}}}})
    if body.get("errors"):
        raise RuntimeError(json.dumps(body["errors"], ensure_ascii=False)[:300])
    token = headers.get("vendure-auth-token")
    if not token:
        raise RuntimeError("no vendure-auth-token header in authenticate response")
    return body["data"]["authenticate"], token


def main():
    now = datetime.utcnow()
    iso = lambda d: d.strftime("%Y-%m-%dT%H:%M:%S.000Z")

    # ---- 1. superadmin 会话（etao）----
    _, vt = vendure_session(sso_token("etao"))
    print("[1] superadmin session ok")

    # ---- 2. 馆（幂等）----
    data = gql(vt, "{ clinics { items { id name } } }")
    if data["clinics"]["items"]:
        clinic = data["clinics"]["items"][0]
        print(f"[2] clinic exists: {clinic}")
    else:
        q = 'mutation { createClinic(input: %s) { id name } }' % inline(
            {"name": "同德堂中医馆", "licenseNo": "BA1101", "address": "北京市朝阳区杏林路 1 号"})
        clinic = gql(vt, q)["createClinic"]
        print(f"[2] clinic created: {clinic}")
    clinic_id = int(clinic["id"])

    # ---- 3. 医生 Administrator（幂等）+ 馆员工 ----
    roles = gql(vt, "{ roles(options: { take: 30 }) { items { id code } } }")["roles"]["items"]
    # 内置超管角色（code=__super_admin_role__，DB id=1）可能被租户过滤出列表，兜底用 id=1
    role_id = next((r["id"] for r in roles if r["code"] == "__super_admin_role__"), "1")
    admins = gql(vt, "{ administrators(options: { take: 100 }) { items { id emailAddress } } }")["administrators"]["items"]
    dao_admin = next((a for a in admins if a["emailAddress"] == "txting@163.com"), None)
    if dao_admin:
        print(f"[3] administrator exists: {dao_admin}")
    else:
        q = 'mutation { createAdministrator(input: %s) { id emailAddress } }' % inline(
            {"firstName": "陶", "lastName": "医生", "emailAddress": "txting@163.com",
             "password": PASSWORD, "roleIds": [role_id]})
        dao_admin = gql(vt, q)["createAdministrator"]
        print(f"[3] administrator created: {dao_admin}")

    _, dao_vt = vendure_session(sso_token("dao"))
    my = gql(dao_vt, "{ myStaff { id clinicId displayName role } }")["myStaff"]
    if any(int(s["clinicId"]) == clinic_id for s in my):
        print(f"[3] clinicStaff exists: {my}")
    else:
        q = 'mutation { createClinicStaff(input: { clinicId: %d, administratorId: %d, displayName: "陶医生", role: "doctor" }) { id displayName role } }' % (
            clinic_id, int(dao_admin["id"]))
        s = gql(vt, q)["createClinicStaff"]
        print(f"[3] clinicStaff created: {s}")

    # ---- 4. 患者（Customer 幂等 + 档案）----
    patients = [
        ("李患者", "13900000002", "平和质"),
        ("王患者", "13900000003", "气虚质"),
        ("赵患者", "13900000004", "湿热质"),
    ]
    profiles = {}
    for name, phone, constitution in patients:
        email = f"{phone}@p.demo"
        found = gql(vt, 'query { customers(options: { take: 5, filter: { emailAddress: { eq: "%s" } } }) { items { id firstName phoneNumber } } }' % email)["customers"]["items"]
        cust = found[0] if found else None
        if not cust:
            q = 'mutation { createCustomer(input: %s) { ... on Customer { id firstName } ... on ErrorResult { errorCode message } } }' % inline(
                {"firstName": name, "lastName": "", "emailAddress": email, "phoneNumber": phone})
            res = gql(vt, q)["createCustomer"]
            if "errorCode" in res:
                raise RuntimeError(f"createCustomer failed: {res}")
            cust = res
            print(f"[4] customer created: {name}")
        plist = gql(dao_vt, "{ patientProfiles(options: { take: 100 }) { items { id customerId clinicId customerName } } }")["patientProfiles"]["items"]
        prof = next((p for p in plist if int(p["customerId"]) == int(cust["id"])), None)
        if not prof:
            q = 'mutation { createPatientProfile(input: { clinicId: %d, customerId: %d, constitution: %s }) { id } }' % (
                clinic_id, int(cust["id"]), inline({"type": constitution}))
            prof = gql(dao_vt, q)["createPatientProfile"]
            print(f"[4] profile created: {name} constitution={constitution}")
        else:
            print(f"[4] profile exists: {name}")
        profiles[name] = int(prof["id"])

    # ---- 5. 接诊 + 病志 ----
    encs = gql(dao_vt, "{ encounters(options: { take: 100 }) { items { id patientProfileId status type } } }")["encounters"]["items"]
    by_profile = {int(e["patientProfileId"]): e for e in encs}

    def ensure_encounter(name, etype, want_status):
        pid = profiles[name]
        enc = by_profile.get(pid)
        if enc:
            print(f"[5] encounter exists: {name} status={enc['status']}")
            return enc
        q = 'mutation { createEncounter(input: { patientProfileId: %d, clinicId: %d, type: "%s" }) { id status } }' % (
            pid, clinic_id, etype)
        enc = gql(dao_vt, q)["createEncounter"]
        if want_status in ("ACTIVE", "COMPLETED"):
            enc = gql(dao_vt, 'mutation { startEncounter(id: %d) { id status } }' % int(enc["id"]))["startEncounter"]
        print(f"[5] encounter created: {name} type={etype} status={enc['status']}")
        return enc

    def ensure_record(encounter_id, chief, diag, rx):
        recs = gql(dao_vt, "{ medicalRecords(options: { take: 100 }) { items { id encounterId version chiefComplaint } } }")["medicalRecords"]["items"]
        rec = next((r for r in recs if int(r["encounterId"]) == int(encounter_id)), None)
        if rec:
            print(f"[5] record exists: encounter={encounter_id} v{rec['version']}")
            return rec
        q = 'mutation { createMedicalRecord(input: %s) { id version } }' % inline(
            {"encounterId": int(encounter_id), "chiefComplaint": chief, "diagnosis": diag, "prescription": rx})
        rec = gql(dao_vt, q)["createMedicalRecord"]
        print(f"[5] record created: v{rec['version']}")
        return rec

    enc_li = ensure_encounter("李患者", "FIRST", "COMPLETED")
    rec_li = ensure_record(enc_li["id"], "失眠多梦，心悸健忘", "心脾两虚",
                           [{"name": "归脾汤加减", "dosage": "7 剂", "frequency": "每日 1 剂", "note": "水煎服，早晚温服"}])
    if rec_li and rec_li.get("version", 1) < 2:
        q = 'mutation { updateMedicalRecord(id: %d, input: %s) { id version } }' % (
            int(rec_li["id"]),
            inline({"chiefComplaint": "失眠多梦，心悸健忘，食欲不振",
                    "diagnosis": "心脾两虚，气血不足",
                    "prescription": [{"name": "归脾汤加减", "dosage": "7 剂", "frequency": "每日 1 剂", "note": "水煎服，早晚温服"},
                                     {"name": "酸枣仁汤", "dosage": "3 剂", "frequency": "隔日 1 剂", "note": "睡前温服"}]}))
        rec = gql(dao_vt, q)["updateMedicalRecord"]
        print(f"[5] record updated: v{rec['version']}")
    st = gql(dao_vt, 'mutation { completeEncounter(id: %d) { id status } }' % int(enc_li["id"]))
    print(f"[5] encounter completed: {st['completeEncounter']['status']}")

    enc_wang = ensure_encounter("王患者", "RETURN", "ACTIVE")
    ensure_record(enc_wang["id"], "胃脘隐痛，喜温喜按", "脾胃虚寒",
                  [{"name": "理中汤加减", "dosage": "5 剂", "frequency": "每日 1 剂", "note": "饭前温服"}])

    enc_zhao = ensure_encounter("赵患者", "FIRST", "PENDING")

    # ---- 6. 康养规划 + 计划项 + 随访 ----
    plans = gql(dao_vt, "{ wellnessPlans(options: { take: 100 }) { items { id patientProfileId title status } } }")["wellnessPlans"]["items"]
    plan_by_profile = {int(p["patientProfileId"]): p for p in plans}

    def ensure_plan(name, title):
        pid = profiles[name]
        plan = plan_by_profile.get(pid)
        if plan:
            print(f"[6] plan exists: {plan['title']} ({plan['status']})")
            return plan
        q = 'mutation { createWellnessPlan(input: { patientProfileId: %d, clinicId: %d, title: "%s", cycleStart: "%s", cycleEnd: "%s" }) { id status } }' % (
            pid, clinic_id, title, iso(now - timedelta(days=7)), iso(now + timedelta(days=83)))
        plan = gql(dao_vt, q)["createWellnessPlan"]
        print(f"[6] plan created: {title} ({plan['status']})")
        return plan

    plan_li = ensure_plan("李患者", "春季综合调理")
    if plan_li["status"] != "ACTIVE":
        plan_li = gql(dao_vt, 'mutation { transitionWellnessPlan(id: %d, to: ACTIVE) { id status } }' % int(plan_li["id"]))["transitionWellnessPlan"]
    plan_detail = gql(dao_vt, 'query { wellnessPlan(id: %d) { id items { id title } followUps { id title status channel dueAt } } }' % int(plan_li["id"]))["wellnessPlan"]
    item_titles = {it["title"] for it in plan_detail["items"]}
    if "针灸推拿" not in item_titles:
        gql(dao_vt, 'mutation { addPlanItem(input: { planId: %d, title: "针灸推拿", frequency: "每周 2 次" }) { id } }' % int(plan_li["id"]))
        gql(dao_vt, 'mutation { addPlanItem(input: { planId: %d, title: "八段锦练习", frequency: "每日 1 次" }) { id } }' % int(plan_li["id"]))
        print("[6] plan items added: 针灸推拿 / 八段锦练习")
    fu_titles = {f["title"]: f for f in plan_detail["followUps"]}
    if "一周后电话回访" not in fu_titles:
        q = 'mutation { createFollowUp(input: { patientProfileId: %d, planId: %d, title: "一周后电话回访", dueAt: "%s", channel: "phone" }) { id status } }' % (
            profiles["李患者"], int(plan_li["id"]), iso(now - timedelta(days=1)))
        f1 = gql(dao_vt, q)["createFollowUp"]
        gql(dao_vt, 'mutation { completeFollowUp(id: %d) { id status } }' % int(f1["id"]))
        print("[6] followup created+completed: 一周后电话回访")
    if "发送调理提醒" not in fu_titles:
        q = 'mutation { createFollowUp(input: { patientProfileId: %d, planId: %d, title: "发送调理提醒", dueAt: "%s", channel: "wechat" }) { id status } }' % (
            profiles["李患者"], int(plan_li["id"]), iso(now + timedelta(days=3)))
        gql(dao_vt, q)
        print("[6] followup created: 发送调理提醒 (待随访)")

    plan_wang = ensure_plan("王患者", "脾胃调理计划")
    detail = gql(dao_vt, 'query { wellnessPlan(id: %d) { id items { id title } } }' % int(plan_wang["id"]))["wellnessPlan"]
    if not detail["items"]:
        gql(dao_vt, 'mutation { addPlanItem(input: { planId: %d, title: "艾灸调理", frequency: "每周 1 次" }) { id } }' % int(plan_wang["id"]))
        print("[6] plan item added: 艾灸调理")

    # ---- 7. 校验 ----
    enc_check = gql(dao_vt, "{ encounters(options: { take: 20 }) { items { id status } totalItems } }")["encounters"]
    statuss = {}
    for e in enc_check["items"]:
        statuss[e["status"]] = statuss.get(e["status"], 0) + 1
    print(f"[7] encounters: total={enc_check['totalItems']} statuss={statuss}")
    fu = gql(dao_vt, "{ followUpTasks(options: { take: 20 }) { items { title status } totalItems } }")["followUpTasks"]
    print(f"[7] followUps: total={fu['totalItems']} {[(i['title'], i['status']) for i in fu['items']]}")
    pl = gql(dao_vt, "{ wellnessPlans(options: { take: 20 }) { items { title status } totalItems } }")["wellnessPlans"]
    print(f"[7] plans: total={pl['totalItems']} {[(i['title'], i['status']) for i in pl['items']]}")
    print("=== SEED DONE ===")


if __name__ == "__main__":
    main()

