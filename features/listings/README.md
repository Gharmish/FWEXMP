# listings

The listing domain shared by its three writers — the host editor
(`features/host-experiences`), the admin editor (`features/admin/experiences`)
and moderation (`features/admin/experience-moderation`): the draft schema,
slug rules, photo rules, readiness predicate and the live-booking schedule
guard. Those three import from here; none of them imports the others
(2026-09 engineering audit ARCH-09).
