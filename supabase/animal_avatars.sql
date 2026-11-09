-- Family animal avatars: Athena is a puppy, Jimmy a tiger cub,
-- Ying a girl calf (calf with a bow) and Felix a boy calf.
update public.family_members set avatar = '🐶'   where name = 'Athena';
update public.family_members set avatar = '🐯'   where name = 'Jimmy';
update public.family_members set avatar = '🐮🎀' where name = 'Ying';
update public.family_members set avatar = '🐮'   where name = 'Felix';
