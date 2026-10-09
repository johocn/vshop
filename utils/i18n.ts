import { getLocale, setLocale as persistLocale } from './storage'

type Dict = Record<string, any>

const messages: Record<string, Dict> = {
  'zh-CN': {
    common: { networkError: '网络异常，请重试', sessionExpired: '登录已过期', confirm: '确认', cancel: '取消', save: '保存', submit: '提交', loading: '加载中...', empty: '暂无数据', success: '操作成功' },
    auth: { loggingIn: '登录中...', loginFailed: '登录失败', notLinked: '该 SSO 账号未绑定医生工作台，请联系管理员', notStaff: '该账号无医生权限', tokenInvalid: '登录凭证无效，请重新登录', notConfigured: 'SSO 未配置', mockLogin: '本地登录', phonePlaceholder: '请输入医生手机号', enter: '进入工作台', mockTip: '本地联调模式：输入已绑定的医生手机号' },
    home: { title: '医生工作台', todayPending: '待接诊', todayActive: '进行中', todayCompleted: '已完成', quickTitle: '快捷入口', newEncounter: '新建接诊', wellnessPlans: '康养规划', followUps: '随访任务', records: '病志档案', patients: '患者列表', searchPlaceholder: '搜索姓名/手机号', visit: '接诊', allClinics: '全部门店' },
    encounter: { type: '接诊类型', FIRST: '初诊', RETURN: '复诊', HOUSE_CALL: '上门', create: '建档接诊', pickPatient: '选择患者', step1: '问诊', step2: '辨证', step3: '医嘱', step4: '完成', chiefComplaint: '主诉', chiefComplaintPh: '患者主诉，如：咳嗽三日，加重伴恶寒', diagnosis: '辨证诊断', diagnosisPh: '辨证结论，如：风寒袭肺证', prescription: '处方', addPrescription: '+ 添加处方项', itemName: '药名/项目', dosage: '剂量', frequency: '频次', note: '备注', submitRecord: '提交病志', completeEncounter: '完成接诊', needStep: '请先完成当前步骤', startEncounter: '开始接诊' },
    plan: { create: '新建规划', title: '规划名称', titlePh: '如：冬季温养方案', cycle: '周期', status_DRAFT: '草稿', status_ACTIVE: '执行中', status_PAUSED: '暂停', status_CLOSED: '已结案', toActive: '开始执行', toPaused: '暂停', toClosed: '结案', items: '计划项', addItem: '添加计划项', itemTitle: '项目名称', frequency: '频次', variantId: '关联商品ID(可选)', followUps: '随访任务', pickPatient: '选择患者' },
    followup: { status_PENDING: '待随访', status_DONE: '已完成', status_CANCELED: '已取消', dueAt: '截止', channel: '渠道', sms: '短信', wechat: '微信', phone: '电话', complete: '完成随访', cancel: '取消任务', create: '新建随访', title: '任务名称', titlePh: '如：一周后回访', planId: '关联规划(可选)' },
    record: { list: '病志档案', version: '版本', chiefComplaint: '主诉', diagnosis: '诊断', prescription: '处方', revisions: '修改留痕', edit: '修改病志', encounter: '接诊', readonly: '已过保存期，只读' },
  },
  'en-US': {
    common: { networkError: 'Network error, please retry', sessionExpired: 'Session expired', confirm: 'Confirm', cancel: 'Cancel', save: 'Save', submit: 'Submit', loading: 'Loading...', empty: 'No data', success: 'Success' },
    auth: { loggingIn: 'Signing in...', loginFailed: 'Login failed', notLinked: 'This SSO account is not linked to the workbench, contact admin', notStaff: 'No doctor permission for this account', tokenInvalid: 'Invalid credential, please sign in again', notConfigured: 'SSO not configured', mockLogin: 'Local Login', phonePlaceholder: 'Doctor phone number', enter: 'Enter Workbench', mockTip: 'Local mock mode: enter a linked doctor phone number' },
    home: { title: 'Doctor Workbench', todayPending: 'Waiting', todayActive: 'In Progress', todayCompleted: 'Completed', quickTitle: 'Quick Actions', newEncounter: 'New Encounter', wellnessPlans: 'Wellness Plans', followUps: 'Follow-ups', records: 'Medical Records', patients: 'Patients', searchPlaceholder: 'Search name/phone', visit: 'Visit', allClinics: 'All Clinics' },
    encounter: { type: 'Type', FIRST: 'First Visit', RETURN: 'Return Visit', HOUSE_CALL: 'House Call', create: 'Create Encounter', pickPatient: 'Select Patient', step1: 'Inquiry', step2: 'Diagnosis', step3: 'Prescription', step4: 'Finish', chiefComplaint: 'Chief Complaint', chiefComplaintPh: 'e.g. Cough for 3 days', diagnosis: 'Syndrome Diagnosis', diagnosisPh: 'e.g. Wind-cold attacking lung', prescription: 'Prescription', addPrescription: '+ Add Item', itemName: 'Item', dosage: 'Dosage', frequency: 'Frequency', note: 'Note', submitRecord: 'Submit Record', completeEncounter: 'Complete Encounter', needStep: 'Please finish current step', startEncounter: 'Start Encounter' },
    plan: { create: 'New Plan', title: 'Plan Title', titlePh: 'e.g. Winter Care Plan', cycle: 'Cycle', status_DRAFT: 'Draft', status_ACTIVE: 'Active', status_PAUSED: 'Paused', status_CLOSED: 'Closed', toActive: 'Activate', toPaused: 'Pause', toClosed: 'Close', items: 'Plan Items', addItem: 'Add Item', itemTitle: 'Item Name', frequency: 'Frequency', variantId: 'Variant ID (optional)', followUps: 'Follow-ups', pickPatient: 'Select Patient' },
    followup: { status_PENDING: 'Pending', status_DONE: 'Done', status_CANCELED: 'Canceled', dueAt: 'Due', channel: 'Channel', sms: 'SMS', wechat: 'WeChat', phone: 'Phone', complete: 'Complete', cancel: 'Cancel', create: 'New Follow-up', title: 'Task Title', titlePh: 'e.g. Follow-up in 1 week', planId: 'Linked Plan (optional)' },
    record: { list: 'Medical Records', version: 'Version', chiefComplaint: 'Chief Complaint', diagnosis: 'Diagnosis', prescription: 'Prescription', revisions: 'Revision History', edit: 'Edit Record', encounter: 'Encounter', readonly: 'Read-only after retention' },
  },
}

export function t(path: string): string {
  const locale = getLocale()
  const dict = messages[locale] || messages['zh-CN']
  const val = path.split('.').reduce<any>((acc, k) => (acc ? acc[k] : undefined), dict)
  if (typeof val === 'string') return val
  const fallback = path.split('.').reduce<any>((acc, k) => (acc ? acc[k] : undefined), messages['zh-CN'])
  return typeof fallback === 'string' ? fallback : path
}

export function currentLocale(): string { return getLocale() }
export function switchLocale(l: 'zh-CN' | 'en-US') { persistLocale(l) }
