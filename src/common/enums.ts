export enum Role {
  FOCAL_POINT = 'FOCAL_POINT',
  DEVELOPER = 'DEVELOPER',
  ADMIN = 'ADMIN',
}

export enum IssueStatus {
  NEW = 'NEW',
  IN_PROGRESS = 'IN_PROGRESS',
  ON_HOLD = 'ON_HOLD',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
  REOPENED = 'REOPENED',
}

export enum Priority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum CommentVisibility {
  INTERNAL = 'INTERNAL',
  REPORTER_VISIBLE = 'REPORTER_VISIBLE',
}

export enum ScanStatus {
  PENDING = 'PENDING',
  CLEAN = 'CLEAN',
  INFECTED = 'INFECTED',
  SKIPPED = 'SKIPPED',
}

export enum ActorType {
  STAFF = 'STAFF',
  SYSTEM = 'SYSTEM',
  REPORTER = 'REPORTER',
}

export enum RecipientType {
  STAFF = 'STAFF',
  REPORTER = 'REPORTER',
}

export enum NotificationChannel {
  EMAIL = 'EMAIL',
  IN_APP = 'IN_APP',
}

export enum NotificationStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
}

export enum JiraSyncStatus {
  NOT_SYNCED = 'NOT_SYNCED',
  PENDING = 'PENDING',
  SYNCED = 'SYNCED',
  FAILED = 'FAILED',
}

export enum PlatformStatus {
  ACTIVE = 'ACTIVE',
  DISABLED = 'DISABLED',
}

export enum AccountStatus {
  ACTIVE = 'ACTIVE',
  DISABLED = 'DISABLED',
}
