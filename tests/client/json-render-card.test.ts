// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import JsonRenderCard from '@/components/hermes/chat/JsonRenderCard.vue'
import { extractJsonRenderSpec, hasKnownJsonRenderTypes } from '@/utils/hermes/json-render-spec'

const spec = { root: 'form', elements: { form: { type: 'Card', props: {}, children: [] } } }

describe('json-render spec extraction', () => {
  it('extracts a spec while preserving markdown before and after', () => {
    const result = extractJsonRenderSpec(`说明\n\n\`\`\`json-render\n${JSON.stringify(spec)}\n\`\`\`\n\n结束`)
    expect(result?.spec).toEqual(spec)
    expect(result?.before).toBe('说明')
    expect(result?.after).toBe('结束')
  })

  it('accepts a truncated closing fence', () => {
    expect(extractJsonRenderSpec(`\`\`\`json-render\n${JSON.stringify(spec)}`)?.spec).toEqual(spec)
  })

  it('normalizes legacy component specs and binds generated form controls', () => {
    const legacy = {
      root: 'name',
      elements: { name: { component: 'Input', props: { label: '名称' } } },
    }
    const result = extractJsonRenderSpec(`\`\`\`json-render\n${JSON.stringify(legacy)}\n\`\`\``)
    expect(result?.spec.elements.name).toMatchObject({ type: 'Input', children: [], props: { value: { $bindState: '/form/name' } } })
  })

  it('renders a legacy form as interactive controls', () => {
    const legacy = {
      root: 'card',
      elements: {
        card: { component: 'Card', props: { title: '工单提报' }, children: ['type', 'description', 'submit'] },
        type: { component: 'Select', props: { label: '工单类型', options: ['故障维修'] } },
        description: { component: 'Textarea', props: { label: '描述' } },
        submit: { component: 'Button', props: { label: '提交' }, on: { click: { action: 'submit_form', params: { actionId: 'work-order.create' } } } },
      },
    }
    const wrapper = mount(JsonRenderCard, { props: { content: `\`\`\`json-render\n${JSON.stringify(legacy)}\n\`\`\`` } })
    expect(wrapper.findAll('select')).toHaveLength(1)
    expect(wrapper.findAll('textarea')).toHaveLength(1)
    expect(wrapper.get('button').text()).toBe('提交')
  })

  it('clears every bound field when reset_form is clicked', async () => {
    const form = {
      root: 'card',
      elements: {
        card: { type: 'Card', props: {}, children: ['type', 'description', 'reset'] },
        type: { type: 'Select', props: { label: '类型', options: ['故障维修'], value: { $bindState: '/form/type' } } },
        description: { type: 'Textarea', props: { label: '描述', value: { $bindState: '/form/description' } } },
        reset: { type: 'Button', props: { label: '重置' }, on: { click: { action: 'reset_form' } } },
      },
    }
    const wrapper = mount(JsonRenderCard, { props: { content: `\`\`\`json-render\n${JSON.stringify(form)}\n\`\`\`` } })
    await wrapper.get('select').setValue('故障维修')
    await wrapper.get('textarea').setValue('待清空内容')
    await wrapper.get('button').trigger('click')
    expect((wrapper.get('select').element as HTMLSelectElement).value).toBe('')
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('')
  })

  it('falls back for invalid JSON or unknown components', () => {
    expect(extractJsonRenderSpec('```json-render\n{bad\n```')).toBeNull()
    expect(hasKnownJsonRenderTypes({ ...spec, elements: { form: { type: 'Unknown', props: {}, children: [] } } }, ['Card'])).toBe(false)
  })
})
