<script setup lang="ts">
import { computed, h, ref } from 'vue'
import { createStateStore, defineCatalog, defineSchema, validateSpec } from '@json-render/core'
import { defineRegistry, JSONUIProvider, Renderer, useBoundProp } from '@json-render/vue'
import { z } from 'zod'
import MarkdownRenderer from './MarkdownRenderer.vue'
import { executeJsonRenderAction } from '@/api/studio/json-render-actions'
import { extractJsonRenderSpec, hasKnownJsonRenderTypes } from '@/utils/hermes/json-render-spec'

const props = defineProps<{ content: string; sessionId?: string; messageId?: string; headingIdPrefix?: string }>()
const emit = defineEmits<{ (event: 'fallback'): void }>()
const parts = computed(() => extractJsonRenderSpec(props.content))
const knownTypes = ['Card', 'Text', 'Stat', 'Badge', 'Row', 'Column', 'Input', 'Textarea', 'Select', 'Button'] as const

const schema = defineSchema(s => ({
  spec: s.object({ root: s.string(), elements: s.record(s.any()) }),
  catalog: s.object({ components: s.map({ props: s.zod() }) }),
}))
const catalog = defineCatalog(schema, {
  components: Object.fromEntries(knownTypes.map(type => [type, { props: z.record(z.string(), z.unknown()) }])) as Record<string, { props: z.ZodType }>,
})

const formState = ref<Record<string, unknown>>({})
const stateStore = createStateStore({ form: {} })
const submitting = ref(false)
const resultMessage = ref('')

function inputComponent(tag: 'input' | 'textarea', ctx: any) {
  const [value, setValue] = useBoundProp<string>(String(ctx.props.value || ''), ctx.bindings?.value)
  return h(tag, {
    value: value || '',
    placeholder: ctx.props.placeholder,
    rows: tag === 'textarea' ? ctx.props.rows : undefined,
    required: ctx.props.required,
    class: 'json-render-field-control',
    onInput: (event: Event) => setValue((event.target as HTMLInputElement).value),
  })
}

const registry = defineRegistry(catalog, {
  components: {
    Card: ({ props: p, children }: any) => h('section', { class: 'json-render-card' }, [
      p.title || p.subtitle ? h('header', { class: 'json-render-card-header' }, [p.title ? h('h3', p.title) : null, p.subtitle ? h('p', { class: 'json-render-subtitle' }, p.subtitle) : null]) : null,
      children,
    ]),
    Text: ({ props: p }: any) => h('p', { class: 'json-render-text' }, String(p.text ?? p.value ?? p.content ?? '')),
    Stat: ({ props: p }: any) => h('div', { class: 'json-render-stat' }, [h('strong', String(p.value ?? '')), h('span', String(p.label ?? ''))]),
    Badge: ({ props: p }: any) => h('span', { class: `json-render-badge ${String(p.variant ?? p.type ?? '')}` }, String(p.label ?? p.text ?? '')),
    Row: ({ children }: any) => h('div', { class: 'json-render-row' }, children),
    Column: ({ children }: any) => h('div', { class: 'json-render-column' }, children),
    Input: (ctx: any) => h('label', { class: 'json-render-field' }, [ctx.props.label ? h('span', ctx.props.label) : null, inputComponent('input', ctx)]),
    Textarea: (ctx: any) => h('label', { class: 'json-render-field' }, [ctx.props.label ? h('span', ctx.props.label) : null, inputComponent('textarea', ctx)]),
    Select: (ctx: any) => {
      const [value, setValue] = useBoundProp<string>(String(ctx.props.value || ''), ctx.bindings?.value)
      return h('label', { class: 'json-render-field' }, [ctx.props.label ? h('span', ctx.props.label) : null, h('select', { value: value || '', class: 'json-render-field-control', onChange: (event: Event) => setValue((event.target as HTMLSelectElement).value) }, (ctx.props.options || []).map((option: unknown) => h('option', { value: String(option) }, String(option))))])
    },
    Button: (ctx: any) => h('button', { type: 'button', class: `json-render-button ${ctx.props.variant || ''}`, disabled: submitting.value, onClick: () => ctx.emit('click') }, String(ctx.props.label || '提交')),
  },
})

async function submitForm(params: Record<string, unknown>) {
  if (submitting.value) return
  const actionId = typeof params.actionId === 'string' ? params.actionId.trim() : ''
  if (!actionId) { resultMessage.value = '动作未配置 actionId'; return }
  submitting.value = true
  resultMessage.value = ''
  try {
    const form = stateStore.get('/form')
    const response = await executeJsonRenderAction({ actionId, form: form && typeof form === 'object' && !Array.isArray(form) ? form as Record<string, unknown> : {}, context: { sessionId: props.sessionId, messageId: props.messageId, surface: 'chat' }, idempotencyKey: `${props.messageId || 'message'}:${actionId}` })
    resultMessage.value = response.ok ? (response.status === 'accepted' ? `已受理：${response.submissionId}` : '提交成功') : response.message
  } catch (error) {
    resultMessage.value = error instanceof Error ? error.message : '提交失败'
  } finally { submitting.value = false }
}

const handlers = { submit_form: (params: Record<string, unknown>) => submitForm(params), reset_form: () => { stateStore.set('/form', {}); formState.value = {}; resultMessage.value = '' } }
const validParts = computed(() => {
  const current = parts.value
  if (!current || !hasKnownJsonRenderTypes(current.spec, knownTypes) || !validateSpec(current.spec).valid) return null
  return current
})
if (!validParts.value && parts.value) emit('fallback')
</script>

<template>
  <template v-if="validParts">
    <div class="json-render-message">
      <MarkdownRenderer v-if="validParts.before" :content="validParts.before" :heading-id-prefix="headingIdPrefix" />
      <div class="json-render-surface">
        <JSONUIProvider :registry="registry.registry" :store="stateStore" :handlers="handlers" @state-change="(changes: any[]) => { for (const change of changes) if (change.path.startsWith('/form/')) formState = { ...formState, [change.path.slice(6)]: change.value } }">
          <Renderer :spec="validParts.spec" :registry="registry.registry" />
        </JSONUIProvider>
      </div>
    </div>
    <div v-if="resultMessage" class="json-render-result">{{ resultMessage }}</div>
  </template>
  <template v-else><MarkdownRenderer :content="content" :heading-id-prefix="headingIdPrefix" /></template>
</template>

<style scoped lang="scss">
.json-render-message { display: flex; flex-direction: column; gap: 10px; }

.json-render-surface {
  min-width: min(720px, 100%);
  max-width: 960px;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--border-color, #a8a8a8) 46%, transparent);
  border-radius: 14px;
  background: linear-gradient(145deg, color-mix(in srgb, var(--card-color, #fff) 92%, #e8eefc), var(--card-color, #fff));
  box-shadow: 0 8px 24px rgba(30, 41, 59, .07);

  :deep(.json-render-card) { display: flex; flex-direction: column; gap: 14px; }
  :deep(.json-render-card-header) { padding-bottom: 12px; border-bottom: 1px solid color-mix(in srgb, var(--border-color, #a8a8a8) 32%, transparent); }
  :deep(.json-render-card h3) { margin: 0; font-size: 16px; font-weight: 650; letter-spacing: -.01em; }
  :deep(.json-render-subtitle) { margin: 4px 0 0; font-size: 13px; line-height: 1.5; opacity: .68; }
  :deep(.json-render-row) { display: flex; align-items: stretch; flex-wrap: wrap; gap: 12px; }
  :deep(.json-render-column) { display: flex; flex-direction: column; gap: 12px; }
  :deep(.json-render-field) { display: flex; flex-direction: column; gap: 6px; min-width: 0; color: var(--text-color, #252525); font-size: 13px; font-weight: 550; }
  :deep(.json-render-row > .json-render-field) { flex: 1 1 180px; }
  :deep(.json-render-field-control) { box-sizing: border-box; width: 100%; min-width: 0; min-height: 38px; padding: 8px 10px; border: 1px solid color-mix(in srgb, var(--border-color, #a8a8a8) 66%, transparent); border-radius: 8px; outline: none; background: color-mix(in srgb, var(--card-color, #fff) 94%, #f2f5fa); color: inherit; font: 400 14px/1.4 inherit; transition: border-color .16s ease, box-shadow .16s ease, background .16s ease; }
  :deep(textarea.json-render-field-control) { min-height: 88px; resize: vertical; }
  :deep(.json-render-field-control:hover) { border-color: color-mix(in srgb, var(--primary-color, #3b82f6) 45%, var(--border-color, #a8a8a8)); }
  :deep(.json-render-field-control:focus) { border-color: var(--primary-color, #3b82f6); box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary-color, #3b82f6) 18%, transparent); background: var(--card-color, #fff); }
  :deep(.json-render-button) { min-height: 38px; padding: 8px 16px; border: 1px solid color-mix(in srgb, var(--border-color, #a8a8a8) 70%, transparent); border-radius: 8px; background: transparent; color: inherit; font: 600 14px/1 inherit; cursor: pointer; transition: transform .15s ease, background .15s ease, box-shadow .15s ease; }
  :deep(.json-render-button:hover:not(:disabled)) { transform: translateY(-1px); background: color-mix(in srgb, var(--primary-color, #3b82f6) 8%, transparent); }
  :deep(.json-render-button.primary) { border-color: var(--primary-color, #3b82f6); background: var(--primary-color, #3b82f6); color: #fff; box-shadow: 0 3px 8px color-mix(in srgb, var(--primary-color, #3b82f6) 28%, transparent); }
  :deep(.json-render-button.primary:hover:not(:disabled)) { background: color-mix(in srgb, var(--primary-color, #3b82f6) 88%, #000); }
  :deep(.json-render-button:disabled) { cursor: wait; opacity: .6; }
  :deep(.json-render-stat) { display: flex; flex-direction: column; gap: 3px; min-width: 120px; padding: 12px; border-radius: 10px; background: color-mix(in srgb, var(--primary-color, #3b82f6) 7%, transparent); }
  :deep(.json-render-row > .json-render-stat) { flex: 1 1 140px; }
  :deep(.json-render-stat strong) { font-size: 21px; line-height: 1.15; }
  :deep(.json-render-stat span) { font-size: 12px; opacity: .65; }
  :deep(.json-render-badge) { width: fit-content; padding: 3px 9px; border-radius: 999px; background: color-mix(in srgb, var(--primary-color, #3b82f6) 13%, transparent); color: var(--primary-color, #3b82f6); font-size: 12px; font-weight: 600; }
}

.json-render-result { margin-top: 8px; padding: 10px 12px; border: 1px solid color-mix(in srgb, #18a058 38%, transparent); border-radius: 10px; background: rgba(24, 160, 88, .07); color: #16834c; font-size: 13px; }

@media (max-width: 760px) { .json-render-surface { min-width: 0; max-width: none; padding: 11px; :deep(.json-render-row > .json-render-field) { flex-basis: 100%; } } }
</style>
