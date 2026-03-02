-- Per–battery-alert SMS option. When true, send-pending will send SMS for this alert (if user has SMS enabled).

alter table public.battery_alerts
  add column if not exists notify_sms boolean not null default false;

comment on column public.battery_alerts.notify_sms is 'When true, low-battery alerts for this rule are sent via SMS (if user has SMS alerts enabled).';
