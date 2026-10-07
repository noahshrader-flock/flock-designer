/**
 * Organization page, new "Usage" tab (the seventh tab, after Data & Privacy).
 *
 * WHAT IT SHOWS
 *   Role Usage: how each role has actually been used over the last 90 days, so an org admin can decide which
 *   roles to clean up. Three parts, in order:
 *     1. Unused Roles: roles nobody has used in 90 days, with row-level and bulk Archive.
 *     2. Usage by Role: one small chart per role (share of the role's users active each day, same 0-100% scale
 *        on every chart so roles compare honestly). Picking a card opens the side panel.
 *     3. Side panel: who holds the selected role and when each person was last active, with Archive Role.
 *   Archiving a role that still has users asks where to move them first (the 40-user case).
 *
 * WHERE IT SITS
 *   Admin > Organization (`/organization` or `/organization/:id`), tab bar order: Overview, Package & Features,
 *   Policies, Settings, Authentication, Data & Privacy, Usage. Reached with `?tab=usage` in the real page.
 *
 * MODELLED ON
 *   src/components/org/upsertOrgPage.tsx (page frame, header, FSTabs bar). Only the frame is reused: none of the
 *   existing tabs' layout or content. Roles vocabulary, the grid toolbar, the confirm dialog and the right-hand
 *   drawer follow src/components/role/ (rolesList, deleteConfirmationDialog, devicesDrawer).
 *
 * WHO THE NAVIGATION SHOWS
 *   A customer's own org admin (not a Flock admin): no "Organizations List" in the sub-nav and no
 *   "< Organization List" back link. Top bar and the rest of the sub-nav are from
 *   .flkd/knowledge/references/admin-shell-roles-2026-10-06.png. Billing and Contact Directory are kept from that
 *   reference, but they depend on the billing permission, so a customer admin may not see them.
 *
 * STATES  (?state=default | empty | loading | archiving-assigned)
 *   default             5 unused roles, 12 used roles.
 *   empty               every role was used in the last 90 days, so the Unused Roles section is its empty state.
 *   loading             content-shaped skeletons for the list and the chart cards.
 *   archiving-assigned  the Archive dialog open for "Legacy Investigator", which is still assigned to 40 people.
 *
 * MARKS
 *   @standin
 *     - Archiving roles. The product can only delete a role with 0 users (rolesList.tsx: delete is disabled when
 *       users are assigned). Archive, archived roles, and "move users to another role on archive" do not exist.
 *     - The per-role usage chart is inline SVG. The product has no chart component and no chart library.
 *     - The definition of "used" (a user signed in and used a permission the role grants) and the 90-day window.
 *   @mock
 *     - Organization name and type, the role list, daily usage per role, creation dates.
 *     - Role holders and their last-active dates.
 *     - The top-bar app links and account menus (copied from the 2026-10-06 reference, not from the account).
 *   @remove
 *     - The state switcher in the bottom-left corner.
 *     - The placeholder shown when any tab other than Usage is clicked.
 *     - The simulated delays (panel load, archive request).
 */
import 'bootstrap/dist/css/bootstrap.min.css';
import '@flocksafety/flock-react-component-lib/build/style.css';

import {
    FSApp,
    FSBox,
    FSButton,
    FSCard,
    FSCardActionArea,
    FSCardContent,
    FSChip,
    FSDataGrid,
    FSDialog,
    FSDialogActions,
    FSDialogContent,
    FSDialogContentText,
    FSDialogTitle,
    FSDivider,
    FSDrawer,
    FSDrawerActions,
    FSDrawerContent,
    FSDrawerHeader,
    FSGrid,
    FSGridActionsCellItem,
    FSIconButton,
    FSAlert,
    FSLink,
    FSList,
    FSListItem,
    FSLoadingButton,
    FSMenuItem,
    FSSelect,
    FSSkeleton,
    FSSnackbarProvider,
    FSStack,
    FSSymbol,
    FSTab,
    FSTabs,
    FSTextField,
    FSTooltip,
    FSTypography,
    FSUniversalNav,
    useFSTheme,
    useSnackbar,
} from '@flocksafety/flock-react-component-lib';
import type { GridColDef, GridRowSelectionModel } from '@mui/x-data-grid-pro';
import { alpha } from '@mui/material/styles';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';

// ---------------------------------------------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------------------------------------------

const DAY_MS = 86_400_000;
const DAYS = 90;
// @mock: the 90-day window ends today (2026-10-06). On move: the usage endpoint defines the window.
const WINDOW_START = Date.UTC(2026, 6, 9);

const formatDate = (ms: number, withYear = false) =>
    new Date(ms).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        ...(withYear ? { year: 'numeric' } : {}),
        timeZone: 'UTC',
    });
const dayMs = (i: number) => WINDOW_START + i * DAY_MS;
const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

const mulberry32 = (seed: number) => () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

type RoleSeed = {
    id: string;
    name: string;
    users: number;
    /** Share of users active on a typical weekday. 0 = never used. */
    rate: number;
    /** Weekend multiplier on the rate. */
    weekend: number;
    /** Index of the last day with any activity, when the role stopped being used mid-window. */
    stopAfter?: number;
    /** Activity is a handful of single-user days rather than a steady share. */
    sparse?: boolean;
    created: string;
};

// @mock: role usage per day. No endpoint exists. On move: replace with the usage endpoint once defined.
const ROLE_SEEDS: RoleSeed[] = [
    { id: 'officer', name: 'Officer', users: 48, rate: 0.72, weekend: 0.8, created: 'Feb 11, 2019' },
    { id: 'patrol', name: 'Patrol', users: 30, rate: 0.66, weekend: 0.9, created: 'Feb 11, 2019' },
    { id: 'detective', name: 'Detective', users: 22, rate: 0.6, weekend: 0.35, created: 'Feb 11, 2019' },
    { id: 'supervisor', name: 'Supervisor', users: 16, rate: 0.55, weekend: 0.45, created: 'Feb 11, 2019' },
    { id: 'dispatcher', name: 'Dispatcher', users: 14, rate: 0.8, weekend: 1, created: 'Aug 3, 2020' },
    { id: 'records-clerk', name: 'Records Clerk', users: 9, rate: 0.6, weekend: 0.1, created: 'Aug 3, 2020' },
    { id: 'traffic-unit', name: 'Traffic Unit', users: 8, rate: 0.45, weekend: 0.5, created: 'May 19, 2021' },
    { id: 'admin', name: 'Admin', users: 6, rate: 0.5, weekend: 0.3, created: 'Feb 11, 2019' },
    { id: 'crime-analyst', name: 'Crime Analyst', users: 5, rate: 0.6, weekend: 0.15, created: 'Nov 2, 2021' },
    {
        id: 'evidence-technician',
        name: 'Evidence Technician',
        users: 4,
        rate: 0.5,
        weekend: 0.2,
        stopAfter: 38,
        created: 'Mar 8, 2022',
    },
    { id: 'hoa-admin', name: 'HOA Admin', users: 3, rate: 0.3, weekend: 1, sparse: true, created: 'Jun 21, 2022' },
    { id: 'auditor', name: 'Auditor', users: 2, rate: 0.12, weekend: 1, sparse: true, created: 'Jan 9, 2023' },
    { id: 'legacy-investigator', name: 'Legacy Investigator', users: 40, rate: 0, weekend: 1, created: 'Apr 4, 2019' },
    { id: 'community-liaison', name: 'Community Liaison', users: 3, rate: 0, weekend: 1, created: 'Sep 15, 2021' },
    { id: 'summer-intern', name: 'Summer Intern', users: 1, rate: 0, weekend: 1, created: 'May 30, 2023' },
    { id: 'temp-contractor-2023', name: 'Temp Contractor 2023', users: 0, rate: 0, weekend: 1, created: 'Jun 12, 2023' },
    { id: 'training-sandbox', name: 'Training Sandbox', users: 0, rate: 0, weekend: 1, created: 'Oct 27, 2020' },
];

type Role = RoleSeed & { daily: number[]; lastUsedIndex: number | null; avgShare: number; isUnused: boolean };

const buildRole = (seed: RoleSeed, order: number): Role => {
    const rnd = mulberry32(1000 + order * 97);
    const daily: number[] = [];
    for (let i = 0; i < DAYS; i += 1) {
        const dow = new Date(dayMs(i)).getUTCDay();
        const isWeekend = dow === 0 || dow === 6;
        let value = 0;
        if (seed.rate > 0 && seed.users > 0 && !(seed.stopAfter !== undefined && i > seed.stopAfter)) {
            if (seed.sparse) {
                value = rnd() < seed.rate ? 1 : 0;
            } else {
                const base = seed.users * seed.rate * (isWeekend ? seed.weekend : 1);
                value = Math.round(base * (0.85 + rnd() * 0.3));
            }
            if (seed.stopAfter === i) {
                value = Math.max(value, 1);
            }
        }
        daily.push(Math.min(value, seed.users));
    }
    let lastUsedIndex: number | null = null;
    daily.forEach((v, i) => {
        if (v > 0) {
            lastUsedIndex = i;
        }
    });
    const avgShare = seed.users === 0 ? 0 : daily.reduce((s, v) => s + v / seed.users, 0) / DAYS;
    return { ...seed, daily, lastUsedIndex, avgShare, isUnused: lastUsedIndex === null };
};

const ALL_ROLES: Role[] = ROLE_SEEDS.map(buildRole);

const FIRST_NAMES = [
    'Marcus', 'Elena', 'Darnell', 'Priya', 'Tomas', 'Alicia', 'Jerome', 'Hannah', 'Luis', 'Grace', 'Omar', 'Naomi',
    'Wesley', 'Imani', 'Caleb', 'Sofia', 'Terrence', 'Mei', 'Andre', 'Rachel', 'Victor', 'Dana', 'Isaac', 'Leah',
];
const LAST_NAMES = [
    'Whitfield', 'Okafor', 'Delgado', 'Brennan', 'Sato', 'Holloway', 'Nguyen', 'Castellano', 'Abara', 'Lindqvist',
    'Mbeki', 'Foster', 'Reyes', 'Kowalski', 'Bishop', 'Tran', 'Hargrove', 'Dube', 'Marsh', 'Pellegrino', 'Ivanov',
    'Greer', 'Salazar', 'Yoon',
];

type Holder = { id: string; name: string; email: string; lastActiveOffset: number | null };

// @mock: role holders and last-active dates. No endpoint exists. On move: replace with the users-by-role endpoint.
const buildHolders = (role: Role, order: number): Holder[] => {
    const rnd = mulberry32(5000 + order * 31);
    const roleIdle = role.lastUsedIndex === null ? null : DAYS - 1 - role.lastUsedIndex;
    return Array.from({ length: role.users }, (_v, i) => {
        const first = FIRST_NAMES[(i * 7 + order * 3) % FIRST_NAMES.length];
        const last = LAST_NAMES[(i * 5 + order * 11 + Math.floor(i / FIRST_NAMES.length)) % LAST_NAMES.length];
        let lastActiveOffset: number | null = null;
        if (roleIdle !== null && (i === 0 || rnd() < 0.85)) {
            lastActiveOffset = i === 0 ? roleIdle : roleIdle + Math.floor(rnd() ** 2 * (DAYS - roleIdle));
        }
        return {
            id: `${role.id}-${i}`,
            name: `${first} ${last}`,
            email: `${first}.${last}`.toLowerCase() + '@aldercreekpd.gov',
            lastActiveOffset,
        };
    });
};

const TODAY_MS = dayMs(DAYS - 1);
const holderLastActive = (h: Holder) => (h.lastActiveOffset === null ? null : TODAY_MS - h.lastActiveOffset * DAY_MS);

// @mock: organization name and type. On move: comes from the organization.
const ORG_TYPE_LABEL = 'LAW ENFORCEMENT';
const ORG_NAME = 'Alder Creek Police Department';

// @mock: top-bar links come from the signed-in account (loggedInUser.nav), which has no current fixture. Copied
// from .flkd/knowledge/references/admin-shell-roles-2026-10-06.png.
const EXTERNAL_APP_LINKS = [
    'Search', 'Alerts', 'Patrol', 'FlockOS', 'Nova', 'VMS', 'Devices', 'Sharing', 'Insights', 'Evidence', 'Admin',
    'Planning Center',
].map((title) => ({ title, url: '#', isInternal: true }));

const HELP_ITEM = {
    title: 'Help',
    options: [{ title: 'Help Center', url: '#' }, { title: 'Contact Support', url: '#' }],
};
const USER_DETAILS_ITEM = {
    title: 'Account',
    options: [{ title: 'Sign Out', url: '#' }],
};

// @mock: sub-nav for a customer's own org admin. On move: computed by useAdminSubNavItems from permissions.
const SUB_NAV_ITEMS = [
    'Profile', 'Organization', 'Devices', 'Roles', 'Users', 'Zones', 'Transparency Portal', 'Integrations',
    'Alerts & FlockOS', 'Billing', 'Contact Directory',
].map((title) => ({ title, value: `/${title}`, isBold: title === 'Organization' }));

// ---------------------------------------------------------------------------------------------------------------
// Chart
// ---------------------------------------------------------------------------------------------------------------

const CHART_W = 300;
const CHART_H = 64;

// @standin: per-role usage chart, inline SVG. No chart component exists. On move: decide a chart library, or
// build one chart component in FUI; keep the shared 0-100% scale and the hover readout.
const RoleUsageChart = ({ role, onHoverIndex, hoverIndex }: {
    role: Role;
    hoverIndex: number | null;
    onHoverIndex: (i: number | null) => void;
}) => {
    const { palette } = useFSTheme();
    const stroke = role.isUnused ? palette.outline.main : palette.primary.main;
    const points = role.daily.map((v, i) => {
        const share = role.users === 0 ? 0 : v / role.users;
        return [(i / (DAYS - 1)) * CHART_W, CHART_H - 2 - share * (CHART_H - 4)] as const;
    });
    const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    const area = `${line} L${CHART_W} ${CHART_H} L0 ${CHART_H} Z`;
    const hoverPoint = hoverIndex === null ? null : points[hoverIndex];

    return (
        <FSBox
            aria-hidden="true"
            sx={{ position: 'relative', height: CHART_H, cursor: 'pointer' }}
            onPointerMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const ratio = (e.clientX - rect.left) / rect.width;
                onHoverIndex(Math.max(0, Math.min(DAYS - 1, Math.round(ratio * (DAYS - 1)))));
            }}
            onPointerLeave={() => onHoverIndex(null)}
        >
            <svg
                viewBox={`0 0 ${CHART_W} ${CHART_H}`}
                preserveAspectRatio="none"
                width="100%"
                height={CHART_H}
                focusable="false"
            >
                {[0, CHART_H / 2, CHART_H - 0.5].map((y) => (
                    <line
                        key={y}
                        x1={0}
                        x2={CHART_W}
                        y1={y}
                        y2={y}
                        stroke={palette.outlineDivider.main}
                        strokeWidth={1}
                        vectorEffect="non-scaling-stroke"
                    />
                ))}
                <path d={area} fill={alpha(stroke, 0.1)} />
                <path
                    d={line}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                />
            </svg>
            {hoverPoint && hoverIndex !== null && (
                <>
                    <FSBox
                        sx={{
                            position: 'absolute',
                            top: 0,
                            bottom: 0,
                            left: `${(hoverIndex / (DAYS - 1)) * 100}%`,
                            width: '1px',
                            bgcolor: 'outline.main',
                            pointerEvents: 'none',
                        }}
                    />
                    <FSBox
                        sx={{
                            position: 'absolute',
                            left: `${(hoverIndex / (DAYS - 1)) * 100}%`,
                            top: `${(hoverPoint[1] / CHART_H) * 100}%`,
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            bgcolor: stroke,
                            border: 2,
                            borderColor: 'background.paper',
                            boxSizing: 'content-box',
                            transform: 'translate(-50%, -50%)',
                            pointerEvents: 'none',
                        }}
                    />
                </>
            )}
        </FSBox>
    );
};

const IDLE_DAYS_THRESHOLD = 30;

const RoleUsageCard = ({ role, selected, onOpen }: { role: Role; selected: boolean; onOpen: () => void }) => {
    const [hoverIndex, setHoverIndex] = useState<number | null>(null);
    const idleDays = role.lastUsedIndex === null ? null : DAYS - 1 - role.lastUsedIndex;
    const isIdle = idleDays !== null && idleDays >= IDLE_DAYS_THRESHOLD;
    const summary = role.isUnused
        ? 'No activity in 90 days'
        : isIdle
          ? `Last used ${formatDate(dayMs(role.lastUsedIndex as number), true)}`
          : `Average ${Math.round(role.avgShare * 100)}% of users active daily`;
    const readout =
        hoverIndex === null
            ? summary
            : `${formatDate(dayMs(hoverIndex), true)}: ${role.daily[hoverIndex]} of ${role.users} users active`;

    return (
        <FSCard
            variant="outlined"
            data-e2e-ref={`role-usage-card-${role.id}`}
            sx={({ palette }) => ({
                height: '100%',
                outline: selected ? `2px solid ${palette.primary.main}` : 'none',
            })}
        >
            <FSCardActionArea
                onClick={onOpen}
                aria-pressed={selected}
                aria-label={`${role.name}, ${plural(role.users, 'user')}. ${summary}. Show who holds this role`}
                sx={{ height: '100%' }}
            >
                <FSCardContent>
                    <FSStack spacing={1}>
                        <FSStack direction="row" alignItems="center" spacing={1}>
                            <FSTypography variant="subtitle1" sx={{ minWidth: 0 }} noWrap>
                                {role.name}
                            </FSTypography>
                            <FSBox flexGrow={1} />
                            {role.isUnused && <FSChip variant="status" size="small" color="warning" label="Unused" />}
                            {isIdle && (
                                <FSChip variant="status" size="small" color="caution" label={`Idle ${idleDays} Days`} />
                            )}
                        </FSStack>
                        <FSTypography variant="caption" color="text.secondary">
                            {plural(role.users, 'User')}
                        </FSTypography>
                        <RoleUsageChart role={role} hoverIndex={hoverIndex} onHoverIndex={setHoverIndex} />
                        <FSStack direction="row" justifyContent="space-between" aria-hidden="true">
                            <FSTypography variant="caption" color="text.secondary">
                                {formatDate(dayMs(0))}
                            </FSTypography>
                            <FSTypography variant="caption" color="text.secondary">
                                {formatDate(dayMs(DAYS - 1))}
                            </FSTypography>
                        </FSStack>
                        <FSTypography variant="caption" color="text.secondary" sx={{ minHeight: '1.5em' }}>
                            {readout}
                        </FSTypography>
                    </FSStack>
                </FSCardContent>
            </FSCardActionArea>
        </FSCard>
    );
};

// ---------------------------------------------------------------------------------------------------------------
// Archive dialog
// ---------------------------------------------------------------------------------------------------------------

// @standin: archive roles, including moving users off an archived role. Today a role can only be deleted when no
// users are assigned. On move: decide what happens to users on archive (this prototype makes the admin pick a role to
// move them to), whether archived roles can be restored, and where archived roles are listed.
const ArchiveRolesDialog = ({
    roles,
    moveTargets,
    loading,
    onCancel,
    onConfirm,
}: {
    roles: Role[];
    moveTargets: Role[];
    loading: boolean;
    onCancel: () => void;
    onConfirm: (moveToRoleId: string | null) => void;
}) => {
    const [moveToRoleId, setMoveToRoleId] = useState('');
    const assignedUsers = roles.reduce((sum, r) => sum + r.users, 0);
    const recentlyUsed = roles.filter((r) => !r.isUnused);
    const needsTarget = assignedUsers > 0;
    const single = roles.length === 1;
    const title = single ? 'Archive Role' : `Archive ${roles.length} Roles`;
    const confirmDisabled = needsTarget && !moveToRoleId;
    const targetName = moveTargets.find((r) => r.id === moveToRoleId)?.name;

    return (
        <FSDialog open data-e2e-ref="archive-dialog">
            <FSStack direction="row" alignItems="center">
                <FSDialogTitle>{title}</FSDialogTitle>
                <FSBox flexGrow={1} />
                <FSIconButton aria-label="Close archive dialog" onClick={onCancel} disabled={loading}>
                    <FSSymbol name="close" aria-hidden="true" />
                </FSIconButton>
            </FSStack>
            <FSDialogContent>
                <FSStack spacing={2} sx={{ width: { sm: 480 }, maxWidth: '100%' }}>
                    <FSDialogContentText>
                        {single
                            ? `Archiving ${roles[0].name} removes it from the Roles list and from the role menu when you add or edit a user.`
                            : `Archiving these roles removes them from the Roles list and from the role menu when you add or edit a user.`}
                    </FSDialogContentText>
                    {!single && (
                        <FSList dense disablePadding>
                            {roles.map((r) => (
                                <Fragment key={r.id}>
                                    <FSListItem sx={{ paddingX: 0 }}>
                                        <FSStack direction="row" width="100%">
                                            <FSTypography>{r.name}</FSTypography>
                                            <FSBox flexGrow={1} />
                                            <FSTypography color="text.secondary">{plural(r.users, 'User')}</FSTypography>
                                        </FSStack>
                                    </FSListItem>
                                    <FSDivider />
                                </Fragment>
                            ))}
                        </FSList>
                    )}
                    {recentlyUsed.length > 0 && (
                        <FSAlert severity="warning">
                            {single
                                ? `People used ${recentlyUsed[0].name} in the last 90 days.`
                                : `People used ${recentlyUsed.map((r) => r.name).join(', ')} in the last 90 days.`}
                        </FSAlert>
                    )}
                    {needsTarget ? (
                        <>
                            <FSAlert severity="warning" data-e2e-ref="assigned-users-warning">
                                {single
                                    ? `${plural(assignedUsers, 'user')} still ${assignedUsers === 1 ? 'has' : 'have'} this role. Choose a role to move them to. Their access changes to match the new role.`
                                    : `${plural(assignedUsers, 'user')} still hold these roles. Choose a role to move them to. Their access changes to match the new role.`}
                            </FSAlert>
                            <FSSelect
                                label={`Move ${plural(assignedUsers, 'User')} To`}
                                value={moveToRoleId}
                                onChange={(e) => setMoveToRoleId(e.target.value as string)}
                                disabled={loading}
                                fullWidth
                            >
                                {moveTargets.map((r) => (
                                    <FSMenuItem key={r.id} value={r.id}>
                                        {r.name}
                                    </FSMenuItem>
                                ))}
                            </FSSelect>
                        </>
                    ) : (
                        <FSTypography variant="body2" color="text.secondary">
                            No users hold {single ? 'this role' : 'these roles'}, so nobody&apos;s access changes.
                        </FSTypography>
                    )}
                </FSStack>
            </FSDialogContent>
            <FSDialogActions>
                <FSButton variant="ghost" autoFocus onClick={onCancel} disabled={loading}>
                    Cancel
                </FSButton>
                <FSBox flexGrow={1} />
                <FSTooltip title={confirmDisabled ? 'Choose a role to move the users to first.' : ''}>
                    <span>
                        <FSLoadingButton
                            variant="destructivePrimary"
                            data-e2e-ref="confirm-archive-button"
                            loading={loading}
                            disabled={confirmDisabled}
                            onClick={() => onConfirm(needsTarget ? moveToRoleId : null)}
                            aria-label={targetName ? `${title}, moving users to ${targetName}` : title}
                        >
                            {title}
                        </FSLoadingButton>
                    </span>
                </FSTooltip>
            </FSDialogActions>
        </FSDialog>
    );
};

// ---------------------------------------------------------------------------------------------------------------
// Side panel
// ---------------------------------------------------------------------------------------------------------------

const RoleHoldersDrawer = ({
    role,
    order,
    onClose,
    onArchive,
}: {
    role: Role;
    order: number;
    onClose: () => void;
    onArchive: () => void;
}) => {
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState('');
    const holders = useMemo(() => buildHolders(role, order), [role, order]);

    // @remove: simulated holders request. On move: the drawer shows the real query's loading state.
    useEffect(() => {
        setLoading(true);
        setQuery('');
        const t = window.setTimeout(() => setLoading(false), 700);
        return () => window.clearTimeout(t);
    }, [role.id]);

    const sorted = useMemo(
        () =>
            [...holders]
                .sort((a, b) => (a.lastActiveOffset ?? 999) - (b.lastActiveOffset ?? 999))
                .filter((h) => `${h.name} ${h.email}`.toLowerCase().includes(query.trim().toLowerCase())),
        [holders, query],
    );
    const activeCount = holders.filter((h) => h.lastActiveOffset !== null).length;

    return (
        <FSDrawer open onClose={onClose} anchor="right" size="medium" variant="persistent" hideBackdrop>
            <>
                <FSDrawerHeader title={role.name} subheader="Role Usage" onClose={onClose} />
                <FSDrawerContent data-e2e-ref="role-details-drawer">
                    <FSStack spacing={2} sx={{ mt: 2 }}>
                        <FSStack direction="row" alignItems="center" spacing={1}>
                            {role.isUnused ? (
                                <FSChip variant="status" size="small" color="warning" label="Unused" />
                            ) : (
                                <FSChip variant="status" size="small" color="success" label="In Use" />
                            )}
                        </FSStack>
                        <FSStack spacing={0.5}>
                            {[
                                ['Users With This Role', String(role.users)],
                                ['Active In The Last 90 Days', String(activeCount)],
                                [
                                    'Last Used',
                                    role.lastUsedIndex === null
                                        ? 'Over 90 days ago'
                                        : formatDate(dayMs(role.lastUsedIndex), true),
                                ],
                                ['Created', role.created],
                            ].map(([label, value]) => (
                                <FSStack key={label} direction="row">
                                    <FSTypography variant="body2" color="text.secondary">
                                        {label}
                                    </FSTypography>
                                    <FSBox flexGrow={1} />
                                    <FSTypography variant="subtitle2">{value}</FSTypography>
                                </FSStack>
                            ))}
                        </FSStack>
                        <FSDivider />
                        <FSTypography variant="h6" component="h3">
                            Who Holds This Role
                        </FSTypography>
                        {role.users === 0 ? (
                            <FSTypography variant="body2" color="text.secondary">
                                Nobody holds this role, so archiving it changes nobody&apos;s access.
                            </FSTypography>
                        ) : (
                            <>
                                <FSTextField
                                    label="Search Users"
                                    value={query}
                                    onChange={setQuery}
                                    InputLabelProps={{ shrink: true }}
                                />
                                {loading ? (
                                    <FSStack spacing={1} data-e2e-ref="role-holders-loading">
                                        {Array.from({ length: Math.min(role.users, 8) }, (_v, i) => (
                                            <FSSkeleton key={i} variant="rectangular" width="100%" height={50} />
                                        ))}
                                    </FSStack>
                                ) : (
                                    <>
                                        <FSTypography variant="subtitle1" color="outline.main">
                                            {query ? `${sorted.length} of ${plural(holders.length, 'User')}` : plural(holders.length, 'User')}
                                        </FSTypography>
                                        {sorted.length === 0 ? (
                                            <FSTypography variant="body2" color="text.secondary">
                                                No users found matching the search.
                                            </FSTypography>
                                        ) : (
                                            <FSList data-e2e-ref="role-holders-list">
                                                {sorted.map((h) => {
                                                    const last = holderLastActive(h);
                                                    return (
                                                        <Fragment key={h.id}>
                                                            <FSListItem sx={{ paddingX: 0 }}>
                                                                <FSStack direction="row" width="100%" spacing={2}>
                                                                    <FSStack sx={{ minWidth: 0 }}>
                                                                        <FSTypography>{h.name}</FSTypography>
                                                                        <FSTypography variant="caption" color="text.secondary" noWrap>
                                                                            {h.email}
                                                                        </FSTypography>
                                                                    </FSStack>
                                                                    <FSBox flexGrow={1} />
                                                                    <FSTypography
                                                                        variant="caption"
                                                                        color="text.secondary"
                                                                        textAlign="right"
                                                                        sx={{ flexShrink: 0 }}
                                                                    >
                                                                        {last === null
                                                                            ? 'No activity in 90 days'
                                                                            : `Active ${formatDate(last, true)}`}
                                                                    </FSTypography>
                                                                </FSStack>
                                                            </FSListItem>
                                                            <FSDivider />
                                                        </Fragment>
                                                    );
                                                })}
                                            </FSList>
                                        )}
                                    </>
                                )}
                            </>
                        )}
                    </FSStack>
                </FSDrawerContent>
                <FSDrawerActions divider>
                    <FSButton variant="destructiveSecondary" data-e2e-ref="drawer-archive-button" onClick={onArchive}>
                        Archive Role
                    </FSButton>
                    <FSBox flexGrow={1} />
                    <FSButton variant="secondary" onClick={onClose}>
                        Close
                    </FSButton>
                </FSDrawerActions>
            </>
        </FSDrawer>
    );
};

// ---------------------------------------------------------------------------------------------------------------
// Usage tab
// ---------------------------------------------------------------------------------------------------------------

type PageState = 'default' | 'empty' | 'loading' | 'archiving-assigned';
const PAGE_STATES: PageState[] = ['default', 'empty', 'loading', 'archiving-assigned'];

const readState = (): PageState => {
    const value = new URLSearchParams(window.location.search).get('state');
    return PAGE_STATES.includes(value as PageState) ? (value as PageState) : 'default';
};

const UnusedRolesEmptyState = () => (
    <FSGrid
        container
        direction="column"
        alignItems="center"
        spacing={2}
        sx={{ mt: 1, mb: 2 }}
        data-e2e-ref="empty-state"
    >
        <FSGrid item>
            <FSSymbol name="inventory_2" aria-hidden="true" sx={{ width: '36px', height: '36px', color: 'outline.main' }} />
        </FSGrid>
        <FSGrid item>
            <FSTypography sx={{ fontWeight: 600, fontSize: 16 }}>No Unused Roles</FSTypography>
        </FSGrid>
        <FSGrid item>
            <FSTypography sx={{ fontSize: 14, maxWidth: '360px', textAlign: 'center' }}>
                Every remaining role was used by at least one person in the last 90 days.
            </FSTypography>
        </FSGrid>
    </FSGrid>
);

const UsageTab = ({ pageState }: { pageState: PageState }) => {
    const snackbar = useSnackbar();
    const isLoading = pageState === 'loading';
    const [archived, setArchived] = useState<string[]>([]);
    const [selection, setSelection] = useState<GridRowSelectionModel>([]);
    const [openRoleId, setOpenRoleId] = useState<string | null>(null);
    const [archiveIds, setArchiveIds] = useState<string[] | null>(
        pageState === 'archiving-assigned' ? ['legacy-investigator'] : null,
    );
    const [archiving, setArchiving] = useState(false);

    const roles = useMemo(
        () => ALL_ROLES.filter((r) => !archived.includes(r.id) && (pageState !== 'empty' || !r.isUnused)),
        [archived, pageState],
    );
    const unusedRoles = roles.filter((r) => r.isUnused);
    const chartRoles = useMemo(
        () =>
            [...roles].sort((a, b) =>
                a.isUnused !== b.isUnused ? Number(a.isUnused) - Number(b.isUnused) : b.avgShare - a.avgShare || b.users - a.users,
            ),
        [roles],
    );
    const openRole = roles.find((r) => r.id === openRoleId) ?? null;
    const archiveRoles = archiveIds ? ALL_ROLES.filter((r) => archiveIds.includes(r.id)) : [];
    const moveTargets = roles.filter((r) => !r.isUnused && !(archiveIds ?? []).includes(r.id));

    const openArchive = useCallback((ids: string[]) => setArchiveIds(ids), []);

    const confirmArchive = (moveToRoleId: string | null) => {
        if (!archiveIds) {
            return;
        }
        setArchiving(true);
        // @remove: simulated archive request. On move: call the archive endpoint and handle its errors.
        window.setTimeout(() => {
            const moved = archiveRoles.reduce((sum, r) => sum + r.users, 0);
            const target = ALL_ROLES.find((r) => r.id === moveToRoleId);
            setArchived((prev) => [...prev, ...archiveIds]);
            setSelection((prev) => prev.filter((id) => !archiveIds.includes(String(id))));
            if (openRoleId && archiveIds.includes(openRoleId)) {
                setOpenRoleId(null);
            }
            setArchiveIds(null);
            setArchiving(false);
            snackbar.success({
                message:
                    archiveRoles.length === 1
                        ? `Archived ${archiveRoles[0].name}.`
                        : `Archived ${archiveRoles.length} roles.`,
                helperText: moved > 0 && target ? `${plural(moved, 'user')} moved to ${target.name}.` : undefined,
            });
        }, 1200);
    };

    const columns: GridColDef<Role>[] = useMemo(
        () => [
            {
                field: 'name',
                headerName: 'Role Name',
                flex: 1.2,
                minWidth: 200,
                renderCell: ({ row }) => (
                    <FSLink component="button" type="button" onClick={() => setOpenRoleId(row.id)}>
                        {row.name}
                    </FSLink>
                ),
            },
            {
                field: 'users',
                headerName: 'Users',
                width: 140,
                renderCell: ({ row }) =>
                    row.users === 0 ? (
                        <FSTypography variant="body2">0 Users</FSTypography>
                    ) : (
                        <FSLink component="button" type="button" onClick={() => setOpenRoleId(row.id)}>
                            {plural(row.users, 'User')}
                        </FSLink>
                    ),
            },
            { field: 'created', headerName: 'Created', width: 160, sortable: false },
            {
                field: 'lastUsed',
                headerName: 'Last Used',
                width: 180,
                sortable: false,
                valueGetter: () => 'Over 90 days ago',
            },
            {
                field: 'actions',
                type: 'actions',
                headerName: 'Actions',
                width: 80,
                resizable: false,
                getActions: ({ row }) => [
                    <FSGridActionsCellItem
                        key="archive"
                        label="Archive"
                        showInMenu
                        onClick={() => openArchive([row.id])}
                    />,
                ],
            },
        ],
        [openArchive],
    );

    return (
        <FSStack spacing={3} sx={{ padding: 3 }} data-e2e-ref="usage-tab-content">
            <FSBox>
                <FSTypography variant="h5" component="h2">
                    Role Usage
                </FSTypography>
                <FSTypography variant="body2" color="text.secondary">
                    See how each role is being used so you can decide which ones to archive. A role counts as used on a
                    day when someone with that role signs in and uses a permission it grants. Showing{' '}
                    {formatDate(dayMs(0))} to {formatDate(dayMs(DAYS - 1), true)}.
                </FSTypography>
            </FSBox>

            <FSBox component="section" aria-labelledby="unused-roles-heading">
                <FSStack direction="row" alignItems="flex-end" spacing={2} sx={{ mb: 1 }}>
                    <FSBox>
                        <FSTypography variant="h6" component="h3" id="unused-roles-heading">
                            Unused Roles
                        </FSTypography>
                        <FSTypography variant="body2" color="text.secondary">
                            {isLoading
                                ? 'Checking role activity.'
                                : unusedRoles.length === 0
                                  ? 'Nothing to clean up right now.'
                                  : `${plural(unusedRoles.length, 'role')} had no activity in the last 90 days.`}
                        </FSTypography>
                    </FSBox>
                    <FSBox flexGrow={1} />
                    {!isLoading && unusedRoles.length > 0 && (
                        <FSTooltip title={selection.length === 0 ? 'Select one or more roles to archive.' : ''}>
                            <span>
                                <FSButton
                                    variant="destructiveSecondary"
                                    data-e2e-ref="bulk-archive-button"
                                    disabled={selection.length === 0}
                                    startIcon={<FSSymbol name="archive" aria-hidden="true" />}
                                    onClick={() => openArchive(selection.map(String))}
                                >
                                    Archive Selected{selection.length > 0 ? ` (${selection.length})` : ''}
                                </FSButton>
                            </span>
                        </FSTooltip>
                    )}
                </FSStack>
                {isLoading ? (
                    <FSStack spacing={1} data-e2e-ref="loading-state">
                        {Array.from({ length: 5 }, (_v, i) => (
                            <FSSkeleton key={i} variant="rectangular" width="100%" height={52} />
                        ))}
                    </FSStack>
                ) : unusedRoles.length === 0 ? (
                    <UnusedRolesEmptyState />
                ) : (
                    <FSBox data-e2e-ref="unused-roles-grid">
                        <FSDataGrid
                            autoHeight
                            hideFooter
                            checkboxSelection
                            disableRowSelectionOnClick
                            rows={unusedRoles}
                            columns={columns}
                            rowSelectionModel={selection}
                            onRowSelectionModelChange={setSelection}
                            initialState={{ sorting: { sortModel: [{ field: 'users', sort: 'desc' }] } }}
                        />
                    </FSBox>
                )}
            </FSBox>

            <FSDivider />

            <FSBox component="section" aria-labelledby="usage-by-role-heading">
                <FSBox sx={{ mb: 2 }}>
                    <FSTypography variant="h6" component="h3" id="usage-by-role-heading">
                        Usage by Role
                    </FSTypography>
                    <FSTypography variant="body2" color="text.secondary">
                        Share of each role&apos;s users who were active each day. Every chart uses the same 0 to 100%
                        scale. Select a role to see who holds it.
                    </FSTypography>
                </FSBox>
                <FSGrid container spacing={2} data-e2e-ref="role-usage-charts">
                    {isLoading
                        ? Array.from({ length: 8 }, (_v, i) => (
                              <FSGrid item xs={12} sm={6} md={4} lg={3} key={i}>
                                  <FSSkeleton variant="rounded" width="100%" height={180} />
                              </FSGrid>
                          ))
                        : chartRoles.map((role) => (
                              <FSGrid item xs={12} sm={6} md={4} lg={3} key={role.id}>
                                  <RoleUsageCard
                                      role={role}
                                      selected={role.id === openRoleId}
                                      onOpen={() => setOpenRoleId(role.id)}
                                  />
                              </FSGrid>
                          ))}
                </FSGrid>
            </FSBox>

            {openRole && (
                <RoleHoldersDrawer
                    role={openRole}
                    order={ROLE_SEEDS.findIndex((s) => s.id === openRole.id)}
                    onClose={() => setOpenRoleId(null)}
                    onArchive={() => openArchive([openRole.id])}
                />
            )}
            {archiveIds && archiveRoles.length > 0 && (
                <ArchiveRolesDialog
                    roles={archiveRoles}
                    moveTargets={moveTargets}
                    loading={archiving}
                    onCancel={() => setArchiveIds(null)}
                    onConfirm={confirmArchive}
                />
            )}
        </FSStack>
    );
};

// ---------------------------------------------------------------------------------------------------------------
// Page: the whole app as a person sees it
// ---------------------------------------------------------------------------------------------------------------

type TabValue = 'overview' | 'packageAndFeatures' | 'policies' | 'settings' | 'authentication' | 'dataAndPrivacy' | 'usage';

// Same order as upsertOrgPage.tsx, with Usage after the last existing tab.
const TABS: { value: TabValue; label: string }[] = [
    { value: 'overview', label: 'Overview' },
    { value: 'packageAndFeatures', label: 'Package & Features' },
    { value: 'policies', label: 'Policies' },
    { value: 'settings', label: 'Settings' },
    { value: 'authentication', label: 'Authentication' },
    { value: 'dataAndPrivacy', label: 'Data & Privacy' },
    { value: 'usage', label: 'Usage' },
];

const OrganizationPage = ({ pageState }: { pageState: PageState }) => {
    const [tab, setTab] = useState<TabValue>('usage');
    const headerRef = useRef<HTMLDivElement>(null);
    const noop = useCallback(() => undefined, []);

    return (
        <FSSnackbarProvider anchorRef={headerRef}>
            <div ref={headerRef}>
                <FSUniversalNav
                    navbarTitle="Admin"
                    logoHref="#"
                    externalAppLinkItems={EXTERNAL_APP_LINKS}
                    helpLinkItem={HELP_ITEM}
                    userDetailsItem={USER_DETAILS_ITEM}
                    activeAppLinkItems={SUB_NAV_ITEMS}
                    activeAppNavigationHandler={noop}
                />
            </div>
            <FSGrid container direction="row" justifyContent="center" padding="1rem 1.5rem">
                <FSBox sx={{ width: '100%', maxWidth: '1200px' }}>
                    <FSStack direction="column" spacing={1} sx={{ marginTop: '1rem' }}>
                        <FSBox sx={{ pb: 2 }}>
                            <FSTypography sx={{ fontSize: 14, color: 'text.secondary' }}>{ORG_TYPE_LABEL}</FSTypography>
                            <FSTypography variant="h1" fontSize="2rem" fontWeight={500}>
                                {ORG_NAME}
                            </FSTypography>
                        </FSBox>
                        <FSBox sx={{ borderBottom: 1, borderColor: 'divider' }}>
                            <FSTabs
                                value={tab}
                                onChange={(_e, v) => setTab(v)}
                                sx={{ px: { xs: 0, sm: 2.5 }, '& .MuiTabs-flexContainer': { justifyContent: 'flex-start' } }}
                                variant="scrollable"
                                scrollButtons="auto"
                                allowScrollButtonsMobile
                            >
                                {TABS.map((t) => (
                                    <FSTab
                                        key={t.value}
                                        label={t.label}
                                        value={t.value}
                                        data-e2e-ref={t.value === 'usage' ? 'usage-tab' : undefined}
                                    />
                                ))}
                            </FSTabs>
                        </FSBox>
                        {tab === 'usage' ? (
                            <UsageTab key={pageState} pageState={pageState} />
                        ) : (
                            // @remove: the other tabs are not part of this prototype. On move: delete.
                            <FSBox sx={{ padding: 3 }}>
                                <FSAlert color="neutral">
                                    The {TABS.find((t) => t.value === tab)?.label} tab is unchanged and not shown in this
                                    prototype. Select Usage to continue.
                                </FSAlert>
                            </FSBox>
                        )}
                    </FSStack>
                </FSBox>
            </FSGrid>
        </FSSnackbarProvider>
    );
};

// @remove: state switcher for reviewers. On move: delete.
const StateSwitcher = ({ value, onChange }: { value: PageState; onChange: (s: PageState) => void }) => (
    <FSStack
        direction="row"
        spacing={0.5}
        alignItems="center"
        data-e2e-ref="state-switcher"
        sx={({ palette }) => ({
            position: 'fixed',
            left: 8,
            bottom: 8,
            zIndex: 2000,
            p: 0.5,
            borderRadius: 1,
            border: 1,
            borderColor: 'divider',
            bgcolor: palette.surface1.main,
        })}
    >
        <FSTypography variant="caption" color="text.secondary" sx={{ px: 1 }}>
            State
        </FSTypography>
        {PAGE_STATES.map((s) => (
            <FSButton key={s} size="sm" variant={s === value ? 'secondaryActive' : 'ghost'} onClick={() => onChange(s)}>
                {s}
            </FSButton>
        ))}
    </FSStack>
);

export default function Page() {
    const [pageState, setPageState] = useState<PageState>(readState);
    const changeState = (s: PageState) => {
        const url = new URL(window.location.href);
        url.searchParams.set('state', s);
        window.history.replaceState(null, '', url);
        setPageState(s);
    };

    return (
        <FSApp>
            <div className="app-container">
                <OrganizationPage key={pageState} pageState={pageState} />
                <StateSwitcher value={pageState} onChange={changeState} />
            </div>
        </FSApp>
    );
}
