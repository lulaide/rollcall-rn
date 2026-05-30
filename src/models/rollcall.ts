// Mirrors CQUPTRollcall/Models/Rollcall.swift

export type RollcallSource = 'qr' | 'number' | 'radar' | string;
export type RollcallStatus = 'absent' | 'on_call' | 'late' | string;

export interface Rollcall {
  rollcall_id: number;
  source: RollcallSource;
  status: RollcallStatus;
  course_title: string;
  rollcall_time?: string | null;

  // Enriched client-side for number tasks via getStudentRollcalls.
  numberCode?: string;
  checkedInCount?: number;
}

export interface RollcallsResponse {
  rollcalls: Rollcall[];
}

export interface CheckinResponse {
  status?: string;
  error_code?: string;
  message?: string;
}

export const isAbsent = (r: Rollcall) => r.status === 'absent';

export const sourceLabel = (s: RollcallSource): string =>
  s === 'qr' ? '扫码' : s === 'number' ? '数字' : s === 'radar' ? '定位' : s;

export const statusLabel = (s: RollcallStatus): string =>
  s === 'absent' ? '未签到' : s === 'on_call' ? '已签到' : s === 'late' ? '迟到' : s;

export const sourceSFSymbol = (s: RollcallSource): string =>
  s === 'qr' ? 'qrcode.viewfinder'
  : s === 'number' ? 'number.circle'
  : s === 'radar' ? 'location.circle'
  : 'questionmark.circle';
