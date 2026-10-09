import { gqlFetch } from './gql'

const Q_MY_STAFF = `query { myStaff { id clinicId displayName role } }`

const Q_PATIENT_PROFILES = `query($skip: Int, $take: Int) {
  patientProfiles(options: { skip: $skip, take: $take }) {
    totalItems
    items { id customerId clinicId customerName customerPhone constitution createdAt }
  }
}`

const Q_ENCOUNTERS = `query($skip: Int, $take: Int, $since: DateTime) {
  encounters(options: { skip: $skip, take: $take, since: $since }) {
    totalItems
    items { id patientProfileId clinicId staffId type status version createdAt updatedAt }
  }
}`

const Q_ENCOUNTER = `query($id: ID!) { encounter(id: $id) { id patientProfileId clinicId staffId type status version } }`

const M_CREATE_ENCOUNTER = `mutation($input: TcmEncounterInput!) { createEncounter(input: $input) { id status version } }`
const M_START_ENCOUNTER = `mutation($id: ID!) { startEncounter(id: $id) { id status } }`
const M_COMPLETE_ENCOUNTER = `mutation($id: ID!) { completeEncounter(id: $id) { id status } }`

const M_CREATE_RECORD = `mutation($input: MedicalRecordInput!) {
  createMedicalRecord(input: $input) { id encounterId clinicId version chiefComplaint diagnosis prescription }
}`
const Q_MEDICAL_RECORD = `query($id: ID!) {
  medicalRecord(id: $id) { id encounterId clinicId version chiefComplaint diagnosis prescription revisions { version editedByStaffId createdAt } }
}`
const Q_MEDICAL_RECORDS = `query($skip: Int, $take: Int) {
  medicalRecords(options: { skip: $skip, take: $take }) { totalItems items { id encounterId clinicId version chiefComplaint diagnosis } }
}`
const M_UPDATE_RECORD = `mutation($id: ID!, $input: UpdateMedicalRecordInput!) {
  updateMedicalRecord(id: $id, input: $input) { id version chiefComplaint diagnosis prescription revisions { version } }
}`

const Q_WELLNESS_PLANS = `query($skip: Int, $take: Int) {
  wellnessPlans(options: { skip: $skip, take: $take }) { totalItems items { id patientProfileId clinicId title status cycleStart cycleEnd } }
}`
const Q_WELLNESS_PLAN = `query($id: ID!) {
  wellnessPlan(id: $id) { id patientProfileId clinicId title status cycleStart cycleEnd items { id planId title frequency productVariantId orderId } followUps { id patientProfileId planId title dueAt channel status followUpEncounterId } }
}`
const M_CREATE_PLAN = `mutation($input: TcmWellnessPlanInput!) { createWellnessPlan(input: $input) { id status } }`
const M_TRANSITION_PLAN = `mutation($id: ID!, $to: WellnessPlanStatus!) { transitionWellnessPlan(id: $id, to: $to) { id status } }`
const M_ADD_PLAN_ITEM = `mutation($input: TcmPlanItemInput!) { addPlanItem(input: $input) { id } }`

const Q_FOLLOW_UPS = `query($skip: Int, $take: Int) {
  followUpTasks(options: { skip: $skip, take: $take }) { totalItems items { id patientProfileId planId title dueAt channel status followUpEncounterId } }
}`
const M_CREATE_FOLLOW_UP = `mutation($input: TcmFollowUpTaskInput!) { createFollowUp(input: $input) { id } }`
const M_COMPLETE_FOLLOW_UP = `mutation($id: ID!) { completeFollowUp(id: $id) { id status } }`
const M_CANCEL_FOLLOW_UP = `mutation($id: ID!) { cancelFollowUp(id: $id) { id status } }`

export const api = {
  myStaff: () => gqlFetch(Q_MY_STAFF).then(d => d.myStaff),
  patientProfiles: (skip = 0, take = 50) => gqlFetch(Q_PATIENT_PROFILES, { skip, take }).then(d => d.patientProfiles),
  encounters: (skip = 0, take = 100, since?: string) => gqlFetch(Q_ENCOUNTERS, { skip, take, since }).then(d => d.encounters),
  encounter: (id: string) => gqlFetch(Q_ENCOUNTER, { id }).then(d => d.encounter),
  createEncounter: (input: { patientProfileId: number; clinicId: number; type?: string }) =>
    gqlFetch(M_CREATE_ENCOUNTER, { input }).then(d => d.createEncounter),
  startEncounter: (id: string) => gqlFetch(M_START_ENCOUNTER, { id }).then(d => d.startEncounter),
  completeEncounter: (id: string) => gqlFetch(M_COMPLETE_ENCOUNTER, { id }).then(d => d.completeEncounter),
  createMedicalRecord: (input: { encounterId: number; chiefComplaint: string; diagnosis: string; prescription?: any }) =>
    gqlFetch(M_CREATE_RECORD, { input }).then(d => d.createMedicalRecord),
  medicalRecord: (id: string) => gqlFetch(Q_MEDICAL_RECORD, { id }).then(d => d.medicalRecord),
  medicalRecords: (skip = 0, take = 50) => gqlFetch(Q_MEDICAL_RECORDS, { skip, take }).then(d => d.medicalRecords),
  updateMedicalRecord: (id: string, input: { chiefComplaint?: string; diagnosis?: string; prescription?: any }) =>
    gqlFetch(M_UPDATE_RECORD, { id, input }).then(d => d.updateMedicalRecord),
  wellnessPlans: (skip = 0, take = 50) => gqlFetch(Q_WELLNESS_PLANS, { skip, take }).then(d => d.wellnessPlans),
  wellnessPlan: (id: string) => gqlFetch(Q_WELLNESS_PLAN, { id }).then(d => d.wellnessPlan),
  createWellnessPlan: (input: { patientProfileId: number; clinicId: number; title: string; cycleStart?: string; cycleEnd?: string }) =>
    gqlFetch(M_CREATE_PLAN, { input }).then(d => d.createWellnessPlan),
  transitionWellnessPlan: (id: string, to: string) => gqlFetch(M_TRANSITION_PLAN, { id, to }).then(d => d.transitionWellnessPlan),
  addPlanItem: (input: { planId: number; title: string; frequency?: string; productVariantId?: number }) =>
    gqlFetch(M_ADD_PLAN_ITEM, { input }).then(d => d.addPlanItem),
  followUpTasks: (skip = 0, take = 100) => gqlFetch(Q_FOLLOW_UPS, { skip, take }).then(d => d.followUpTasks),
  createFollowUp: (input: { patientProfileId: number; planId?: number; title: string; dueAt: string; channel?: string }) =>
    gqlFetch(M_CREATE_FOLLOW_UP, { input }).then(d => d.createFollowUp),
  completeFollowUp: (id: string) => gqlFetch(M_COMPLETE_FOLLOW_UP, { id }).then(d => d.completeFollowUp),
  cancelFollowUp: (id: string) => gqlFetch(M_CANCEL_FOLLOW_UP, { id }).then(d => d.cancelFollowUp),
}

export function todayStartIso(): string {
  const d = new Date(); d.setHours(0, 0, 0, 0)
  return d.toISOString()
}
