-- 给已有 profiles 表补上 role 列，避免旧库缺列导致前端读取会话失败。
alter table if exists public.profiles
  add column if not exists role text;

-- 旧数据补默认值，确保后续管理员判断和 profile 读取都能正常工作。
update public.profiles
set role = 'user'
where role is null;

alter table public.profiles
  alter column role set default 'user';

alter table public.profiles
  alter column role set not null;
