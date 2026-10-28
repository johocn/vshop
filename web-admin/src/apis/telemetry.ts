// P4-4 系统监控：埋点 KPI / 明细 / 错误报告（admin-api）
// schema 以 vendure/packages/campus-delivery-plugin/src/campus-delivery.plugin.ts adminApiExtensions 为准
import { getAdminClient } from './client';

export interface TrendPoint {
  date: string;
  events: number;
  errors: number;
}

export interface EventCount {
  name: string;
  count: number;
}

export interface TrackEventStats {
  todayEvents: number;
  totalEvents: number;
  todayErrors: number;
  totalErrors: number;
  /** 今日去重顾客数（游客不计） */
  affectedUsers: number;
  trend: TrendPoint[];
  topEvents: EventCount[];
}

export interface TrackEventRow {
  id: string;
  eventName: string;
  page?: string | null;
  sessionId?: string | null;
  customerId?: string | null;
  props?: string | null;
  createdAt: string;
}

export interface ErrorReportRow {
  id: string;
  source: string;
  level: string;
  message: string;
  stack?: string | null;
  page?: string | null;
  url?: string | null;
  customerId?: string | null;
  createdAt: string;
}

export async function fetchTrackStats(): Promise<TrackEventStats> {
  const { campusTrackEventStats } = await getAdminClient().request<{ campusTrackEventStats: TrackEventStats }>(
    `query MonitorStats {
      campusTrackEventStats {
        todayEvents totalEvents todayErrors totalErrors affectedUsers
        trend { date events errors }
        topEvents { name count }
      }
    }`,
  );
  return campusTrackEventStats;
}

export async function fetchTrackEvents(eventName?: string, skip = 0, take = 20) {
  const { campusTrackEventList } = await getAdminClient().request<{
    campusTrackEventList: { items: TrackEventRow[]; totalItems: number };
  }>(
    `query MonitorEvents($eventName: String, $skip: Int, $take: Int) {
      campusTrackEventList(eventName: $eventName, skip: $skip, take: $take) {
        items { id eventName page sessionId customerId props createdAt }
        totalItems
      }
    }`,
    { eventName: eventName || null, skip, take },
  );
  return campusTrackEventList;
}

export async function fetchErrorReports(level?: string, skip = 0, take = 20) {
  const { campusErrorReportList } = await getAdminClient().request<{
    campusErrorReportList: { items: ErrorReportRow[]; totalItems: number };
  }>(
    `query MonitorErrors($level: String, $skip: Int, $take: Int) {
      campusErrorReportList(level: $level, skip: $skip, take: $take) {
        items { id source level message stack page url customerId createdAt }
        totalItems
      }
    }`,
    { level: level || null, skip, take },
  );
  return campusErrorReportList;
}
