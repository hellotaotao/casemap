import {
  AI_PROVIDERS,
  createDefaultProviderSettings,
  getProviderDefinition,
  providerIds,
  type ProviderConnectionStatus,
  type ProviderId,
  type ProviderSettings,
} from './aiProviders'

export type DebateAgentRole =
  | 'affirmative'
  | 'negative'
  | 'judge'
  | 'strategyCoach'
  | 'evidenceScout'
  | 'attackSimulator'

export type RoleProviderSelection = ProviderId | 'auto'

export type RoleAssignments = Record<DebateAgentRole, RoleProviderSelection>

export type GenerationMode = 'provider' | 'local-fallback'

export type GenerationSource = {
  role: DebateAgentRole
  roleLabel: string
  providerId?: ProviderId
  providerName: string
  status: ProviderConnectionStatus
  mode: GenerationMode
  label: string
  reason?: string
}

export type AiRunMetadata = {
  roleAssignments: RoleAssignments
  roles: Record<DebateAgentRole, GenerationSource>
  fallbackUsed: boolean
  summary: string
}

export type RoleAssignmentChoice = {
  value: RoleProviderSelection
  label: string
  configured: boolean
  status?: ProviderConnectionStatus
}

export type RoleAssignmentsStorage = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>

export const roleAssignmentsStorageKey = 'ai-debate-lab.role-assignments.v1'

export const debateAgentRoles: Array<{ id: DebateAgentRole; label: string; description: string }> = [
  {
    id: 'affirmative',
    label: '正方',
    description: '负责生成正方主线、论点和防守素材。',
  },
  {
    id: 'negative',
    label: '反方',
    description: '负责生成反方主线、论点和防守素材。',
  },
  {
    id: 'judge',
    label: '裁判',
    description: '负责从判准、可投票性和胜负理由上审查路线。',
  },
  {
    id: 'strategyCoach',
    label: '策略教练',
    description: '负责整理最终路线图和赛制执行顺序。',
  },
  {
    id: 'evidenceScout',
    label: '证据侦察',
    description: '负责提示证据类型、检索方向和材料优先级。',
  },
  {
    id: 'attackSimulator',
    label: '攻击模拟器',
    description: '负责模拟对方攻击、压力测试和迭代调整。',
  },
]

const roleIds = debateAgentRoles.map((role) => role.id)

export function createDefaultRoleAssignments(): RoleAssignments {
  return debateAgentRoles.reduce(
    (assignments, role) => ({
      ...assignments,
      [role.id]: 'auto' as const,
    }),
    {} as RoleAssignments,
  )
}

export function assignProviderToRole(
  assignments: RoleAssignments,
  role: DebateAgentRole,
  provider: RoleProviderSelection,
): RoleAssignments {
  return {
    ...assignments,
    [role]: provider,
  }
}

export function getRoleAssignmentChoices(settings: ProviderSettings): RoleAssignmentChoice[] {
  const configuredProviders = AI_PROVIDERS.filter((provider) => settings.providers[provider.id]?.apiKey.trim())

  return [
    {
      configured: true,
      label: 'Auto',
      value: 'auto',
    },
    ...configuredProviders.map((provider) => ({
      configured: true,
      label: provider.displayName,
      status: settings.providers[provider.id]?.status,
      value: provider.id,
    })),
  ]
}

export function createRoleAssignmentsRepository(storage: RoleAssignmentsStorage) {
  return {
    clear() {
      storage.removeItem(roleAssignmentsStorageKey)
    },
    load(): RoleAssignments {
      const raw = storage.getItem(roleAssignmentsStorageKey)

      if (!raw) return createDefaultRoleAssignments()

      try {
        return normalizeRoleAssignments(JSON.parse(raw))
      } catch {
        return createDefaultRoleAssignments()
      }
    },
    save(assignments: RoleAssignments) {
      storage.setItem(roleAssignmentsStorageKey, JSON.stringify(normalizeRoleAssignments(assignments)))
    },
  }
}

export function normalizeRoleAssignments(value: unknown): RoleAssignments {
  const defaults = createDefaultRoleAssignments()

  if (!isRecord(value)) return defaults

  return roleIds.reduce((assignments, role) => {
    const selection = value[role]
    assignments[role] = isProviderSelection(selection) ? selection : defaults[role]
    return assignments
  }, { ...defaults })
}

export function resolveRoleGenerationSources(
  assignments: RoleAssignments,
  settings: ProviderSettings = createDefaultProviderSettings(),
): Record<DebateAgentRole, GenerationSource> {
  return debateAgentRoles.reduce((sources, role) => {
    sources[role.id] = resolveRoleGenerationSource(role.id, assignments[role.id], settings)
    return sources
  }, {} as Record<DebateAgentRole, GenerationSource>)
}

export function createAiRunMetadata(
  assignments: RoleAssignments = createDefaultRoleAssignments(),
  settings: ProviderSettings = createDefaultProviderSettings(),
): AiRunMetadata {
  const roles = resolveRoleGenerationSources(assignments, settings)
  const fallbackUsed = Object.values(roles).some((source) => source.mode === 'local-fallback')

  return {
    fallbackUsed,
    roleAssignments: normalizeRoleAssignments(assignments),
    roles,
    summary: fallbackUsed ? '部分角色使用本地 fallback。' : '所有已分配角色均可使用已连接 provider。',
  }
}

export function getRoleLabel(role: DebateAgentRole): string {
  return debateAgentRoles.find((definition) => definition.id === role)?.label ?? role
}

function resolveRoleGenerationSource(
  role: DebateAgentRole,
  selection: RoleProviderSelection,
  settings: ProviderSettings,
): GenerationSource {
  if (selection === 'auto') {
    const connectedProvider = providerIds.find((providerId) => {
      const config = settings.providers[providerId]
      return Boolean(config?.apiKey.trim()) && config?.status === 'connected'
    })

    if (connectedProvider) {
      return createProviderSource(role, connectedProvider, settings.providers[connectedProvider].status)
    }

    const configuredProvider = providerIds.find((providerId) => settings.providers[providerId]?.apiKey.trim())
    if (configuredProvider) {
      return createFallbackSource(
        role,
        configuredProvider,
        settings.providers[configuredProvider].status,
        'Auto 未找到已连通服务，已使用本地 fallback。',
      )
    }

    return createFallbackSource(role, undefined, 'not-configured', '尚未配置可用服务，已使用本地确定性 fallback。')
  }

  const config = settings.providers[selection]

  if (!config?.apiKey.trim()) {
    return createFallbackSource(role, selection, 'not-configured', `${getProviderDefinition(selection).displayName} 未配置 API Key。`)
  }

  if (config.status === 'connected') {
    return createProviderSource(role, selection, config.status)
  }

  return createFallbackSource(role, selection, config.status, createFallbackReason(selection, config.status, config.message))
}

function createProviderSource(
  role: DebateAgentRole,
  providerId: ProviderId,
  status: ProviderConnectionStatus,
): GenerationSource {
  const roleLabel = getRoleLabel(role)
  const providerName = getProviderDefinition(providerId).displayName

  return {
    label: `${roleLabel}：${providerName}（已连接）`,
    mode: 'provider',
    providerId,
    providerName,
    role,
    roleLabel,
    status,
  }
}

function createFallbackSource(
  role: DebateAgentRole,
  providerId: ProviderId | undefined,
  status: ProviderConnectionStatus,
  reason: string,
): GenerationSource {
  const roleLabel = getRoleLabel(role)
  const providerName = providerId ? getProviderDefinition(providerId).displayName : '本地 fallback'

  return {
    label: `${roleLabel}：${providerName}（本地 fallback）`,
    mode: 'local-fallback',
    providerId,
    providerName,
    reason,
    role,
    roleLabel,
    status,
  }
}

function createFallbackReason(
  providerId: ProviderId,
  status: ProviderConnectionStatus,
  message?: string,
): string {
  const providerName = getProviderDefinition(providerId).displayName

  switch (status) {
    case 'browser-blocked':
      return `${providerName} 请求被浏览器阻止，已使用本地 fallback。`
    case 'failed':
      return message ? `${providerName} 连接失败：${message}` : `${providerName} 连接失败，已使用本地 fallback。`
    case 'not-configured':
      return `${providerName} 尚未测试连接，已使用本地 fallback。`
    case 'connected':
      return `${providerName} 已连接。`
  }
}

function isProviderSelection(value: unknown): value is RoleProviderSelection {
  return value === 'auto' || providerIds.includes(value as ProviderId)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
