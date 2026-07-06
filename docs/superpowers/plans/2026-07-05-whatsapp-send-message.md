# WhatsApp Send Message Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Manual "Send WhatsApp" action on Person and Opportunity record pages that sends a Meta Cloud API template or text message and logs it as a `whatsappMessage` record.

**Architecture:** Self-contained `sales-crm/whatsapp` NestJS module (config via env vars → thin Cloud API client → orchestrator service → GraphQL resolver on the metadata schema), a provisioned `whatsappMessage` custom object, and a command-menu-item action wired to a new `EngineComponentKey.SEND_WHATSAPP` headless component that opens a modal. Spec: `docs/superpowers/specs/2026-07-05-whatsapp-send-design.md`.

**Tech Stack:** NestJS, GraphQL (metadata schema scope), GlobalWorkspaceOrmManager, Meta Graph API v23.0 via `fetch`, React + Apollo (metadata client), jest.

**Conventions that apply to every task:** named exports only, types over interfaces, no `any`, no abbreviations, `//` comments only for non-obvious WHY. Run commands from repo root unless stated. The fork's "deal/lead" object is the standard `opportunity` object.

---

### Task 1: WhatsApp config variables

**Files:**
- Modify: `packages/twenty-server/src/engine/core-modules/twenty-config/enums/config-variables-group.enum.ts`
- Modify: `packages/twenty-server/src/engine/core-modules/twenty-config/config-variables.ts`

- [ ] **Step 1.1: Add enum group.** In `config-variables-group.enum.ts`, add to the enum (alphabetical placement not required; append near the end before the closing brace):

```ts
  WHATSAPP_SETTINGS = 'WHATSAPP_SETTINGS',
```

Also check `constants/config-variables-group-metadata.constant.ts` in the same directory (if it exists — `ls packages/twenty-server/src/engine/core-modules/twenty-config/constants/`) for a per-group metadata map; if groups are described there, add an entry `{ position: <max+1>, description: 'WhatsApp Cloud API settings', isHiddenOnLoad: true }` mirroring the AWS_SES_SETTINGS entry.

- [ ] **Step 1.2: Add the three variables.** In `config-variables.ts`, inside `class ConfigVariables`, after the `EMAIL_SETTINGS` block (around line 400), add:

```ts
  @ConfigVariablesMetadata({
    group: ConfigVariablesGroup.WHATSAPP_SETTINGS,
    description: 'Permanent system-user access token for the Meta WhatsApp Cloud API',
    type: ConfigVariableType.STRING,
    isSensitive: true,
  })
  @IsOptional()
  WHATSAPP_ACCESS_TOKEN: string | undefined = undefined;

  @ConfigVariablesMetadata({
    group: ConfigVariablesGroup.WHATSAPP_SETTINGS,
    description: 'Phone number id of the WhatsApp Business sender number',
    type: ConfigVariableType.STRING,
  })
  @IsOptional()
  WHATSAPP_PHONE_NUMBER_ID: string | undefined = undefined;

  @ConfigVariablesMetadata({
    group: ConfigVariablesGroup.WHATSAPP_SETTINGS,
    description: 'WhatsApp Business Account id, used to list message templates',
    type: ConfigVariableType.STRING,
  })
  @IsOptional()
  WHATSAPP_BUSINESS_ACCOUNT_ID: string | undefined = undefined;
```

Before committing, open a neighboring `isSensitive` usage in the same file (`grep -n isSensitive config-variables.ts | head -3`) to confirm the property name; drop it if the codebase spells it differently and no equivalent exists.

- [ ] **Step 1.3: Typecheck.** Run: `npx nx typecheck twenty-server`. Expected: pass.

- [ ] **Step 1.4: Commit.**

```bash
git add packages/twenty-server/src/engine/core-modules/twenty-config
git commit -m "feat(sales-crm): WhatsApp Cloud API config variables"
```

---

### Task 2: Provision `whatsappMessage` object

**Files:**
- Create: `tools/sales-crm/provision-whatsapp.mjs`

Copy the header/helpers (env config, `gql`, `login`, `fetchObjects`, `createObject`, `createField`, `opt`) **verbatim** from `tools/sales-crm/provision-discount-bundle-rules.mjs` (lines 1–72), then define the model:

- [ ] **Step 2.1: Write the script** with this model section (helpers as above, main loop copied from the discount script's — it iterates OBJECTS creating missing ones, then FIELDS, then RELATIONS; if the discount script has no RELATIONS section, copy the relation-creation blocks from `tools/sales-crm/provision-phase1.mjs` which creates RELATION fields):

```js
const OBJECTS = [
  { nameSingular: 'whatsappMessage', namePlural: 'whatsappMessages', labelSingular: 'WhatsApp Message', labelPlural: 'WhatsApp Messages', icon: 'IconBrandWhatsapp', description: 'An outbound WhatsApp message sent to a contact via the Meta Cloud API' },
];

const FIELDS = {
  whatsappMessage: [
    { name: 'direction', label: 'Direction', type: 'SELECT', icon: 'IconArrowsExchange', options: [opt('OUTBOUND', 'Outbound', 0, 'green'), opt('INBOUND', 'Inbound', 1, 'blue')], defaultValue: "'OUTBOUND'" },
    { name: 'status', label: 'Status', type: 'SELECT', icon: 'IconProgressCheck', options: [opt('SENT', 'Sent', 0, 'green'), opt('FAILED', 'Failed', 1, 'red')] },
    { name: 'toPhone', label: 'To Phone', type: 'TEXT', icon: 'IconPhone' },
    { name: 'body', label: 'Body', type: 'TEXT', icon: 'IconMessage' },
    { name: 'templateName', label: 'Template Name', type: 'TEXT', icon: 'IconTemplate' },
    { name: 'waMessageId', label: 'Meta Message Id', type: 'TEXT', icon: 'IconHash' },
    { name: 'errorMessage', label: 'Error Message', type: 'TEXT', icon: 'IconAlertTriangle' },
  ],
};

const RELATIONS = [
  { source: 'whatsappMessage', name: 'person', label: 'Person', target: 'person', targetFieldLabel: 'WhatsApp Messages', targetFieldIcon: 'IconBrandWhatsapp', icon: 'IconUser' },
  { source: 'whatsappMessage', name: 'opportunity', label: 'Opportunity', target: 'opportunity', targetFieldLabel: 'WhatsApp Messages', targetFieldIcon: 'IconBrandWhatsapp', icon: 'IconTargetArrow' },
];
```

Match the exact field/relation input shapes used by the existing scripts (e.g. SELECT options key, `relationCreationPayload`) — read `provision-phase1.mjs`'s relation block and mirror it exactly.

- [ ] **Step 2.2: Run against dev.** Start the dev server if not running (`bash packages/twenty-utils/setup-dev-env.sh` then `npx nx start twenty-server` in background), then:

Run: `node tools/sales-crm/provision-whatsapp.mjs`
Expected output: lines confirming created object `whatsappMessage`, its fields, and 2 relations (or "skip" lines on re-run — run twice to prove idempotency).

- [ ] **Step 2.3: Verify** via the Postgres MCP or GraphQL: the `whatsappMessage` object exists with all 7 scalar fields + 2 relation fields.

- [ ] **Step 2.4: Commit.**

```bash
git add tools/sales-crm/provision-whatsapp.mjs
git commit -m "feat(sales-crm): provisioning script for WhatsApp Message object"
```

---

### Task 3: Cloud API client service (TDD)

**Files:**
- Create: `packages/twenty-server/src/modules/sales-crm/whatsapp/utils/build-whatsapp-send-payload.util.ts`
- Create: `packages/twenty-server/src/modules/sales-crm/whatsapp/utils/build-whatsapp-send-payload.util.spec.ts`
- Create: `packages/twenty-server/src/modules/sales-crm/whatsapp/services/whatsapp-cloud-api-client.service.ts`
- Create: `packages/twenty-server/src/modules/sales-crm/whatsapp/services/whatsapp-cloud-api-client.service.spec.ts`

- [ ] **Step 3.1: Write failing payload-builder tests** (`build-whatsapp-send-payload.util.spec.ts`):

```ts
import {
  buildWhatsappTemplatePayload,
  buildWhatsappTextPayload,
} from 'src/modules/sales-crm/whatsapp/utils/build-whatsapp-send-payload.util';

describe('buildWhatsappTextPayload', () => {
  it('should build a text payload for an E.164 recipient', () => {
    expect(buildWhatsappTextPayload('+93700123456', 'Hello')).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '+93700123456',
      type: 'text',
      text: { body: 'Hello' },
    });
  });
});

describe('buildWhatsappTemplatePayload', () => {
  it('should build a template payload with body parameters', () => {
    expect(
      buildWhatsappTemplatePayload('+93700123456', 'summer_offer', 'en', ['25%', 'Aug 31']),
    ).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '+93700123456',
      type: 'template',
      template: {
        name: 'summer_offer',
        language: { code: 'en' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: '25%' },
              { type: 'text', text: 'Aug 31' },
            ],
          },
        ],
      },
    });
  });

  it('should omit components when there are no parameters', () => {
    const payload = buildWhatsappTemplatePayload('+93700123456', 'hello_world', 'en_US', []);

    expect(payload.template).toEqual({ name: 'hello_world', language: { code: 'en_US' } });
  });
});
```

- [ ] **Step 3.2: Run to verify failure.** Run: `npx jest packages/twenty-server/src/modules/sales-crm/whatsapp/utils/build-whatsapp-send-payload.util.spec.ts --config=packages/twenty-server/jest.config.mjs`
Expected: FAIL (module not found).

- [ ] **Step 3.3: Implement the util:**

```ts
type WhatsappTemplateComponent = {
  type: 'body';
  parameters: { type: 'text'; text: string }[];
};

export const buildWhatsappTextPayload = (to: string, body: string) => ({
  messaging_product: 'whatsapp',
  recipient_type: 'individual',
  to,
  type: 'text',
  text: { body },
});

export const buildWhatsappTemplatePayload = (
  to: string,
  templateName: string,
  languageCode: string,
  bodyParameters: string[],
) => {
  const components: WhatsappTemplateComponent[] =
    bodyParameters.length > 0
      ? [
          {
            type: 'body',
            parameters: bodyParameters.map((text) => ({ type: 'text' as const, text })),
          },
        ]
      : [];

  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(components.length > 0 ? { components } : {}),
    },
  };
};
```

- [ ] **Step 3.4: Run tests.** Same command as 3.2. Expected: PASS.

- [ ] **Step 3.5: Write failing client tests** (`whatsapp-cloud-api-client.service.spec.ts`). Mock global `fetch`:

```ts
import { WhatsappCloudApiClientService } from 'src/modules/sales-crm/whatsapp/services/whatsapp-cloud-api-client.service';

const configGetMock = jest.fn();
const twentyConfigServiceMock = { get: configGetMock } as never;

describe('WhatsappCloudApiClientService', () => {
  let service: WhatsappCloudApiClientService;

  beforeEach(() => {
    jest.clearAllMocks();
    configGetMock.mockImplementation((key: string) =>
      ({
        WHATSAPP_ACCESS_TOKEN: 'token-123',
        WHATSAPP_PHONE_NUMBER_ID: '111222333',
        WHATSAPP_BUSINESS_ACCOUNT_ID: '444555666',
      })[key],
    );
    service = new WhatsappCloudApiClientService(twentyConfigServiceMock);
  });

  it('should throw a configuration error when the token is missing', async () => {
    configGetMock.mockReturnValue(undefined);

    await expect(service.sendText('+93700123456', 'hi')).rejects.toThrow(
      'WhatsApp is not configured',
    );
  });

  it('should POST a text message and return the wamid', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: 'wamid.abc' }] }),
    }) as never;

    const result = await service.sendText('+93700123456', 'hi');

    expect(result.waMessageId).toBe('wamid.abc');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://graph.facebook.com/v23.0/111222333/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer token-123' }),
      }),
    );
  });

  it('should surface the Meta error message and code on failure', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        error: { message: 'Re-engagement message', code: 131047 },
      }),
    }) as never;

    await expect(service.sendText('+93700123456', 'hi')).rejects.toMatchObject({
      metaErrorCode: 131047,
    });
  });

  it('should list only approved templates with body text and variable count', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            name: 'summer_offer',
            status: 'APPROVED',
            language: 'en',
            components: [{ type: 'BODY', text: 'Get {{1}} off before {{2}}!' }],
          },
          { name: 'rejected_one', status: 'REJECTED', language: 'en', components: [] },
        ],
      }),
    }) as never;

    const templates = await service.listTemplates();

    expect(templates).toEqual([
      {
        name: 'summer_offer',
        language: 'en',
        status: 'APPROVED',
        bodyText: 'Get {{1}} off before {{2}}!',
        variableCount: 2,
      },
    ]);
  });
});
```

- [ ] **Step 3.6: Run to verify failure**, then **implement the service:**

```ts
import { Injectable } from '@nestjs/common';

import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import {
  buildWhatsappTemplatePayload,
  buildWhatsappTextPayload,
} from 'src/modules/sales-crm/whatsapp/utils/build-whatsapp-send-payload.util';

const GRAPH_API_BASE_URL = 'https://graph.facebook.com/v23.0';

export class WhatsappApiError extends Error {
  constructor(
    message: string,
    public readonly metaErrorCode?: number,
  ) {
    super(message);
  }
}

export type WhatsappTemplateSummary = {
  name: string;
  language: string;
  status: string;
  bodyText: string;
  variableCount: number;
};

@Injectable()
export class WhatsappCloudApiClientService {
  constructor(private readonly twentyConfigService: TwentyConfigService) {}

  private getConfigOrThrow() {
    const accessToken = this.twentyConfigService.get('WHATSAPP_ACCESS_TOKEN');
    const phoneNumberId = this.twentyConfigService.get('WHATSAPP_PHONE_NUMBER_ID');
    const businessAccountId = this.twentyConfigService.get('WHATSAPP_BUSINESS_ACCOUNT_ID');

    if (!accessToken || !phoneNumberId) {
      throw new WhatsappApiError(
        'WhatsApp is not configured: set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID',
      );
    }

    return { accessToken, phoneNumberId, businessAccountId };
  }

  private async postMessage(payload: Record<string, unknown>): Promise<{ waMessageId: string }> {
    const { accessToken, phoneNumberId } = this.getConfigOrThrow();

    const response = await fetch(`${GRAPH_API_BASE_URL}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });

    const json = await response.json();

    if (!response.ok) {
      throw new WhatsappApiError(
        json?.error?.message ?? 'WhatsApp API request failed',
        json?.error?.code,
      );
    }

    return { waMessageId: json.messages?.[0]?.id ?? '' };
  }

  async sendText(to: string, body: string) {
    return this.postMessage(buildWhatsappTextPayload(to, body));
  }

  async sendTemplate(to: string, name: string, languageCode: string, bodyParameters: string[]) {
    return this.postMessage(
      buildWhatsappTemplatePayload(to, name, languageCode, bodyParameters),
    );
  }

  async listTemplates(): Promise<WhatsappTemplateSummary[]> {
    const { accessToken, businessAccountId } = this.getConfigOrThrow();

    if (!businessAccountId) {
      throw new WhatsappApiError(
        'WhatsApp is not configured: set WHATSAPP_BUSINESS_ACCOUNT_ID to list templates',
      );
    }

    const response = await fetch(
      `${GRAPH_API_BASE_URL}/${businessAccountId}/message_templates?fields=name,status,language,components&limit=100`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    const json = await response.json();

    if (!response.ok) {
      throw new WhatsappApiError(
        json?.error?.message ?? 'Failed to list WhatsApp templates',
        json?.error?.code,
      );
    }

    return (json.data ?? [])
      .filter((template: { status: string }) => template.status === 'APPROVED')
      .map((template: { name: string; language: string; status: string; components: { type: string; text?: string }[] }) => {
        const bodyComponent = (template.components ?? []).find(
          (component) => component.type === 'BODY',
        );
        const bodyText = bodyComponent?.text ?? '';

        return {
          name: template.name,
          language: template.language,
          status: template.status,
          bodyText,
          // {{1}}, {{2}}… placeholders determine how many inputs the UI renders
          variableCount: new Set(bodyText.match(/\{\{\d+\}\}/g) ?? []).size,
        };
      });
  }
}
```

- [ ] **Step 3.7: Run both spec files.** Run: `npx jest packages/twenty-server/src/modules/sales-crm/whatsapp --config=packages/twenty-server/jest.config.mjs`
Expected: all PASS. (If `TwentyConfigService.get` typing rejects the raw mock, cast via `as unknown as TwentyConfigService`.)

- [ ] **Step 3.8: Commit.**

```bash
git add packages/twenty-server/src/modules/sales-crm/whatsapp
git commit -m "feat(sales-crm): WhatsApp Cloud API client with payload builders"
```

---

### Task 4: Recipient phone resolution util (TDD)

**Files:**
- Create: `packages/twenty-server/src/modules/sales-crm/whatsapp/utils/resolve-whatsapp-recipient-phone.util.ts`
- Create: `packages/twenty-server/src/modules/sales-crm/whatsapp/utils/resolve-whatsapp-recipient-phone.util.spec.ts`

Twenty PHONES composite fields hydrate on a record as `<fieldName>PrimaryPhoneNumber`, `<fieldName>PrimaryPhoneCountryCode`, `<fieldName>PrimaryPhoneCallingCode` (verify against how sales-crm services read composite subfields — check any usage of a PHONES/CURRENCY composite in `packages/twenty-server/src/modules/sales-crm/services/`; the CURRENCY pattern there shows the naming, e.g. `amountMicros`. If the ORM returns nested objects instead — `record.whatsapp.primaryPhoneNumber` — adapt the accessor in Step 4.3 accordingly and update the tests to match; the precedence logic stays identical).

- [ ] **Step 4.1: Write failing tests:**

```ts
import { resolveWhatsappRecipientPhone } from 'src/modules/sales-crm/whatsapp/utils/resolve-whatsapp-recipient-phone.util';

describe('resolveWhatsappRecipientPhone', () => {
  it('should prefer the whatsapp field over the standard phones field', () => {
    expect(
      resolveWhatsappRecipientPhone({
        whatsappPrimaryPhoneNumber: '700123456',
        whatsappPrimaryPhoneCallingCode: '+93',
        phonesPrimaryPhoneNumber: '999',
        phonesPrimaryPhoneCallingCode: '+1',
      }),
    ).toBe('+93700123456');
  });

  it('should fall back to the standard phones field', () => {
    expect(
      resolveWhatsappRecipientPhone({
        phonesPrimaryPhoneNumber: '700123456',
        phonesPrimaryPhoneCallingCode: '+93',
      }),
    ).toBe('+93700123456');
  });

  it('should strip spaces, dashes and a leading zero from the national number', () => {
    expect(
      resolveWhatsappRecipientPhone({
        whatsappPrimaryPhoneNumber: '0700 123-456',
        whatsappPrimaryPhoneCallingCode: '+93',
      }),
    ).toBe('+93700123456');
  });

  it('should pass through a number already in E.164', () => {
    expect(
      resolveWhatsappRecipientPhone({ whatsappPrimaryPhoneNumber: '+93700123456' }),
    ).toBe('+93700123456');
  });

  it('should return null when no phone exists', () => {
    expect(resolveWhatsappRecipientPhone({})).toBeNull();
  });
});
```

- [ ] **Step 4.2: Run to verify failure.** Run: `npx jest packages/twenty-server/src/modules/sales-crm/whatsapp/utils/resolve-whatsapp-recipient-phone.util.spec.ts --config=packages/twenty-server/jest.config.mjs` — FAIL.

- [ ] **Step 4.3: Implement:**

```ts
import { isNonEmptyString } from 'twenty-shared/utils';

type PersonPhoneFields = {
  whatsappPrimaryPhoneNumber?: string | null;
  whatsappPrimaryPhoneCallingCode?: string | null;
  phonesPrimaryPhoneNumber?: string | null;
  phonesPrimaryPhoneCallingCode?: string | null;
};

const composeE164 = (
  number: string | null | undefined,
  callingCode: string | null | undefined,
): string | null => {
  if (!isNonEmptyString(number)) {
    return null;
  }

  const cleaned = number.replace(/[\s\-()]/g, '');

  if (cleaned.startsWith('+')) {
    return cleaned;
  }

  if (!isNonEmptyString(callingCode)) {
    return null;
  }

  // Meta requires E.164: calling code + national number without the trunk zero
  const nationalNumber = cleaned.replace(/^0/, '');
  const normalizedCallingCode = callingCode.startsWith('+') ? callingCode : `+${callingCode}`;

  return `${normalizedCallingCode}${nationalNumber}`;
};

export const resolveWhatsappRecipientPhone = (person: PersonPhoneFields): string | null =>
  composeE164(person.whatsappPrimaryPhoneNumber, person.whatsappPrimaryPhoneCallingCode) ??
  composeE164(person.phonesPrimaryPhoneNumber, person.phonesPrimaryPhoneCallingCode);
```

- [ ] **Step 4.4: Run tests** — PASS. **Commit:**

```bash
git add packages/twenty-server/src/modules/sales-crm/whatsapp/utils
git commit -m "feat(sales-crm): WhatsApp recipient phone resolution (E.164)"
```

---

### Task 5: Send orchestrator service (TDD)

**Files:**
- Create: `packages/twenty-server/src/modules/sales-crm/whatsapp/services/whatsapp-send-message.service.ts`
- Create: `packages/twenty-server/src/modules/sales-crm/whatsapp/services/whatsapp-send-message.service.spec.ts`

- [ ] **Step 5.1: Write failing tests.** Mock the client and the ORM manager (follow the mocking style of existing sales-crm service specs, e.g. `deal-product-price-calculation` — read one first):

```ts
import { WhatsappApiError } from 'src/modules/sales-crm/whatsapp/services/whatsapp-cloud-api-client.service';
import { WhatsappSendMessageService } from 'src/modules/sales-crm/whatsapp/services/whatsapp-send-message.service';

const personFindOneMock = jest.fn();
const whatsappMessageSaveMock = jest.fn();
const getRepositoryMock = jest.fn(async (_workspaceId: string, objectName: string) =>
  objectName === 'person'
    ? { findOne: personFindOneMock }
    : { save: whatsappMessageSaveMock },
);
const globalWorkspaceOrmManagerMock = {
  getRepository: getRepositoryMock,
  executeInWorkspaceContext: jest.fn(async (callback: () => unknown) => callback()),
} as never;

const sendTextMock = jest.fn();
const sendTemplateMock = jest.fn();
const clientMock = { sendText: sendTextMock, sendTemplate: sendTemplateMock } as never;

describe('WhatsappSendMessageService', () => {
  let service: WhatsappSendMessageService;

  beforeEach(() => {
    jest.clearAllMocks();
    personFindOneMock.mockResolvedValue({
      id: 'person-1',
      whatsappPrimaryPhoneNumber: '700123456',
      whatsappPrimaryPhoneCallingCode: '+93',
    });
    service = new WhatsappSendMessageService(globalWorkspaceOrmManagerMock, clientMock);
  });

  it('should send a text message and persist a SENT record', async () => {
    sendTextMock.mockResolvedValue({ waMessageId: 'wamid.abc' });

    const result = await service.send({
      workspaceId: 'ws-1',
      personId: 'person-1',
      opportunityId: 'opp-1',
      text: 'Hello!',
    });

    expect(result).toEqual({ success: true, waMessageId: 'wamid.abc', error: null });
    expect(sendTextMock).toHaveBeenCalledWith('+93700123456', 'Hello!');
    expect(whatsappMessageSaveMock).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: 'OUTBOUND',
        status: 'SENT',
        toPhone: '+93700123456',
        body: 'Hello!',
        waMessageId: 'wamid.abc',
        personId: 'person-1',
        opportunityId: 'opp-1',
      }),
    );
  });

  it('should send a template with parameters and log the template name', async () => {
    sendTemplateMock.mockResolvedValue({ waMessageId: 'wamid.tpl' });

    await service.send({
      workspaceId: 'ws-1',
      personId: 'person-1',
      templateName: 'summer_offer',
      templateLanguage: 'en',
      templateBodyParams: ['25%'],
    });

    expect(sendTemplateMock).toHaveBeenCalledWith('+93700123456', 'summer_offer', 'en', ['25%']);
    expect(whatsappMessageSaveMock).toHaveBeenCalledWith(
      expect.objectContaining({ templateName: 'summer_offer', status: 'SENT' }),
    );
  });

  it('should persist a FAILED record and return the error when Meta rejects', async () => {
    sendTextMock.mockRejectedValue(new WhatsappApiError('Re-engagement message', 131047));

    const result = await service.send({
      workspaceId: 'ws-1',
      personId: 'person-1',
      text: 'Hello!',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('24 hours');
    expect(whatsappMessageSaveMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'FAILED' }),
    );
  });

  it('should fail before calling Meta when the person has no phone', async () => {
    personFindOneMock.mockResolvedValue({ id: 'person-1' });

    const result = await service.send({ workspaceId: 'ws-1', personId: 'person-1', text: 'x' });

    expect(result.success).toBe(false);
    expect(sendTextMock).not.toHaveBeenCalled();
    expect(whatsappMessageSaveMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 5.2: Run to verify failure**, then **implement:**

```ts
import { Injectable } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import {
  WhatsappApiError,
  WhatsappCloudApiClientService,
} from 'src/modules/sales-crm/whatsapp/services/whatsapp-cloud-api-client.service';
import { resolveWhatsappRecipientPhone } from 'src/modules/sales-crm/whatsapp/utils/resolve-whatsapp-recipient-phone.util';

// Meta error 131047: free-form message outside the 24h customer service window
const RE_ENGAGEMENT_ERROR_CODE = 131047;

export type SendWhatsappMessageParams = {
  workspaceId: string;
  personId: string;
  opportunityId?: string | null;
  text?: string | null;
  templateName?: string | null;
  templateLanguage?: string | null;
  templateBodyParams?: string[] | null;
};

export type SendWhatsappMessageResult = {
  success: boolean;
  waMessageId: string | null;
  error: string | null;
};

@Injectable()
export class WhatsappSendMessageService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly whatsappCloudApiClientService: WhatsappCloudApiClientService,
  ) {}

  async send(params: SendWhatsappMessageParams): Promise<SendWhatsappMessageResult> {
    const { workspaceId, personId } = params;

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
      const personRepository = await this.globalWorkspaceOrmManager.getRepository(
        workspaceId,
        'person',
        { shouldBypassPermissionChecks: true },
      );

      const person = await personRepository.findOne({ where: { id: personId } });

      if (!isDefined(person)) {
        return { success: false, waMessageId: null, error: 'Person not found' };
      }

      const toPhone = resolveWhatsappRecipientPhone(person);

      if (!isDefined(toPhone)) {
        return {
          success: false,
          waMessageId: null,
          error: 'This contact has no phone number',
        };
      }

      const isTemplate = isDefined(params.templateName);
      const bodySummary = isTemplate
        ? `[${params.templateName}] ${(params.templateBodyParams ?? []).join(', ')}`
        : (params.text ?? '');

      try {
        const { waMessageId } = isTemplate
          ? await this.whatsappCloudApiClientService.sendTemplate(
              toPhone,
              params.templateName as string,
              params.templateLanguage ?? 'en',
              params.templateBodyParams ?? [],
            )
          : await this.whatsappCloudApiClientService.sendText(toPhone, params.text ?? '');

        await this.persistMessage(workspaceId, params, {
          status: 'SENT',
          toPhone,
          body: bodySummary,
          waMessageId,
          errorMessage: null,
        });

        return { success: true, waMessageId, error: null };
      } catch (error) {
        const errorMessage = this.toUserFacingError(error);

        await this.persistMessage(workspaceId, params, {
          status: 'FAILED',
          toPhone,
          body: bodySummary,
          waMessageId: null,
          errorMessage,
        });

        return { success: false, waMessageId: null, error: errorMessage };
      }
    }, buildSystemAuthContext(workspaceId));
  }

  private toUserFacingError(error: unknown): string {
    if (error instanceof WhatsappApiError && error.metaErrorCode === RE_ENGAGEMENT_ERROR_CODE) {
      return 'Use an approved template — this contact has not messaged you in the last 24 hours.';
    }

    return error instanceof Error ? error.message : 'Failed to send WhatsApp message';
  }

  private async persistMessage(
    workspaceId: string,
    params: SendWhatsappMessageParams,
    fields: {
      status: 'SENT' | 'FAILED';
      toPhone: string;
      body: string;
      waMessageId: string | null;
      errorMessage: string | null;
    },
  ): Promise<void> {
    const whatsappMessageRepository = await this.globalWorkspaceOrmManager.getRepository(
      workspaceId,
      'whatsappMessage',
      { shouldBypassPermissionChecks: true },
    );

    await whatsappMessageRepository.save({
      direction: 'OUTBOUND',
      templateName: params.templateName ?? '',
      personId: params.personId,
      opportunityId: params.opportunityId ?? null,
      ...fields,
    });
  }
}
```

Note on `executeInWorkspaceContext` signature: `deal-product-pricing-version-lookup.service.ts:30-38` calls it with a callback and builds `buildSystemAuthContext(workspaceId)` — open that file and match the exact call signature (auth context argument position) before finalizing; adjust the mock in Step 5.1 to the real signature.

- [ ] **Step 5.3: Run tests.** Run: `npx jest packages/twenty-server/src/modules/sales-crm/whatsapp --config=packages/twenty-server/jest.config.mjs` — all PASS.

- [ ] **Step 5.4: Commit.**

```bash
git add packages/twenty-server/src/modules/sales-crm/whatsapp
git commit -m "feat(sales-crm): WhatsApp send orchestrator with message persistence"
```

---

### Task 6: DTOs, resolver, module registration

**Files:**
- Create: `packages/twenty-server/src/modules/sales-crm/whatsapp/dtos/send-whatsapp-message.input.ts`
- Create: `packages/twenty-server/src/modules/sales-crm/whatsapp/dtos/send-whatsapp-message-output.dto.ts`
- Create: `packages/twenty-server/src/modules/sales-crm/whatsapp/dtos/whatsapp-template.dto.ts`
- Create: `packages/twenty-server/src/modules/sales-crm/whatsapp/resolvers/whatsapp.resolver.ts`
- Create: `packages/twenty-server/src/modules/sales-crm/whatsapp/whatsapp.module.ts`
- Modify: `packages/twenty-server/src/engine/core-modules/core-engine.module.ts` (add `WhatsappModule` to imports next to `SendEmailModule`, line ~130)

- [ ] **Step 6.1: DTOs.**

`send-whatsapp-message.input.ts`:

```ts
import { Field, InputType } from '@nestjs/graphql';

@InputType()
export class SendWhatsappMessageInput {
  @Field(() => String)
  personId: string;

  @Field(() => String, { nullable: true })
  opportunityId?: string;

  @Field(() => String, { nullable: true })
  text?: string;

  @Field(() => String, { nullable: true })
  templateName?: string;

  @Field(() => String, { nullable: true })
  templateLanguage?: string;

  @Field(() => [String], { nullable: true })
  templateBodyParams?: string[];
}
```

`send-whatsapp-message-output.dto.ts`:

```ts
import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class SendWhatsappMessageOutputDTO {
  @Field(() => Boolean)
  success: boolean;

  @Field(() => String, { nullable: true })
  waMessageId?: string | null;

  @Field(() => String, { nullable: true })
  error?: string | null;
}
```

`whatsapp-template.dto.ts`:

```ts
import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class WhatsappTemplateDTO {
  @Field(() => String)
  name: string;

  @Field(() => String)
  language: string;

  @Field(() => String)
  status: string;

  @Field(() => String)
  bodyText: string;

  @Field(() => Int)
  variableCount: number;
}
```

- [ ] **Step 6.2: Resolver** (`whatsapp.resolver.ts`) — mirror `send-email.resolver.ts` guards minus the permission flag:

```ts
import { Logger, UseFilters, UseGuards, UsePipes } from '@nestjs/common';
import { Args, Mutation, Query } from '@nestjs/graphql';

import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { AuthGraphqlApiExceptionFilter } from 'src/engine/core-modules/auth/filters/auth-graphql-api-exception.filter';
import { ResolverValidationPipe } from 'src/engine/core-modules/graphql/pipes/resolver-validation.pipe';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { SendWhatsappMessageOutputDTO } from 'src/modules/sales-crm/whatsapp/dtos/send-whatsapp-message-output.dto';
import { SendWhatsappMessageInput } from 'src/modules/sales-crm/whatsapp/dtos/send-whatsapp-message.input';
import { WhatsappTemplateDTO } from 'src/modules/sales-crm/whatsapp/dtos/whatsapp-template.dto';
import { WhatsappCloudApiClientService } from 'src/modules/sales-crm/whatsapp/services/whatsapp-cloud-api-client.service';
import { WhatsappSendMessageService } from 'src/modules/sales-crm/whatsapp/services/whatsapp-send-message.service';

@MetadataResolver()
@UsePipes(ResolverValidationPipe)
@UseFilters(AuthGraphqlApiExceptionFilter)
@UseGuards(WorkspaceAuthGuard)
export class WhatsappResolver {
  private readonly logger = new Logger(WhatsappResolver.name);

  constructor(
    private readonly whatsappSendMessageService: WhatsappSendMessageService,
    private readonly whatsappCloudApiClientService: WhatsappCloudApiClientService,
  ) {}

  @Mutation(() => SendWhatsappMessageOutputDTO)
  async sendWhatsappMessage(
    @Args('input') input: SendWhatsappMessageInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<SendWhatsappMessageOutputDTO> {
    const hasTemplate = Boolean(input.templateName);
    const hasText = Boolean(input.text);

    if (hasTemplate === hasText) {
      return {
        success: false,
        error: 'Provide exactly one of templateName or text',
      };
    }

    try {
      return await this.whatsappSendMessageService.send({
        workspaceId: workspace.id,
        ...input,
      });
    } catch (error) {
      this.logger.error(`Failed to send WhatsApp message: ${error}`);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send WhatsApp message',
      };
    }
  }

  @Query(() => [WhatsappTemplateDTO])
  async whatsappTemplates(): Promise<WhatsappTemplateDTO[]> {
    return this.whatsappCloudApiClientService.listTemplates();
  }
}
```

- [ ] **Step 6.3: Module** (`whatsapp.module.ts`):

```ts
import { Module } from '@nestjs/common';

import { TwentyORMModule } from 'src/engine/twenty-orm/twenty-orm.module';
import { WhatsappResolver } from 'src/modules/sales-crm/whatsapp/resolvers/whatsapp.resolver';
import { WhatsappCloudApiClientService } from 'src/modules/sales-crm/whatsapp/services/whatsapp-cloud-api-client.service';
import { WhatsappSendMessageService } from 'src/modules/sales-crm/whatsapp/services/whatsapp-send-message.service';

@Module({
  imports: [TwentyORMModule],
  providers: [WhatsappCloudApiClientService, WhatsappSendMessageService, WhatsappResolver],
})
export class WhatsappModule {}
```

Register in `core-engine.module.ts`: add `import { WhatsappModule } from 'src/modules/sales-crm/whatsapp/whatsapp.module';` and `WhatsappModule,` directly after `SendEmailModule,` (~line 130).

- [ ] **Step 6.4: Verify schema boots.** Run: `npx nx typecheck twenty-server && npx nx lint:diff-with-main twenty-server`. Expected: pass. Then restart the dev server and confirm startup logs show no DI errors, and the metadata GraphQL schema exposes the new mutation:

```bash
curl -s http://localhost:3010/metadata -H 'Content-Type: application/json' \
  -d '{"query":"{ __type(name: \"Mutation\") { fields { name } } }"}' | grep -o 'sendWhatsappMessage'
```

Expected output: `sendWhatsappMessage`.

- [ ] **Step 6.5: Commit.**

```bash
git add packages/twenty-server/src/modules/sales-crm/whatsapp packages/twenty-server/src/engine/core-modules/core-engine.module.ts
git commit -m "feat(sales-crm): sendWhatsappMessage mutation and whatsappTemplates query"
```

---

### Task 7: EngineComponentKey + standard command menu items

**Files:**
- Modify: `packages/twenty-server/src/engine/metadata-modules/command-menu-item/enums/engine-component-key.enum.ts` (add after `COMPOSE_CAMPAIGN`, line ~53)
- Modify: `packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/constants/standard-command-menu-item.constant.ts`

- [ ] **Step 7.1: Enum.** Add `SEND_WHATSAPP = 'SEND_WHATSAPP',` to `EngineComponentKey`.

- [ ] **Step 7.2: Command menu items.** In `standard-command-menu-item.constant.ts`, after the `composeEmailToOpportunity` entry (~line 1030), add two entries mirroring `composeEmailToPerson` (~line 1000) exactly, with these values:

```ts
  sendWhatsappToPerson: {
    universalIdentifier: '3f8a1c2e-9b4d-4e6f-a1b2-c3d4e5f6a7b8',
    label: 'Send WhatsApp',
    icon: 'IconBrandWhatsapp',
    isPinned: true,
    position: 68,
    shortLabel: 'WhatsApp',
    availabilityType: CommandMenuItemAvailabilityType.RECORD_SELECTION,
    conditionalAvailabilityExpression: 'numberOfSelectedRecords == 1',
    availabilityObjectMetadataUniversalIdentifier:
      STANDARD_OBJECTS.person.universalIdentifier,
    frontComponentUniversalIdentifier: null,
    engineComponentKey: EngineComponentKey.SEND_WHATSAPP,
    hotKeys: null,
  },
  sendWhatsappToOpportunity: {
    universalIdentifier: '5b2d9e0f-1a3c-4d5e-b6f7-a8b9c0d1e2f3',
    label: 'Send WhatsApp',
    icon: 'IconBrandWhatsapp',
    isPinned: true,
    position: 69,
    shortLabel: 'WhatsApp',
    availabilityType: CommandMenuItemAvailabilityType.RECORD_SELECTION,
    conditionalAvailabilityExpression: 'numberOfSelectedRecords == 1',
    availabilityObjectMetadataUniversalIdentifier:
      STANDARD_OBJECTS.opportunity.universalIdentifier,
    frontComponentUniversalIdentifier: null,
    engineComponentKey: EngineComponentKey.SEND_WHATSAPP,
    hotKeys: null,
  },
```

If positions 68/69 collide with existing entries (grep `position: 68`), pick the next free positions.

- [ ] **Step 7.3: Typecheck + lint.** `npx nx typecheck twenty-server && npx nx lint:diff-with-main twenty-server` — pass. (If a schema/enum sync test exists for EngineComponentKey — run `npx jest engine-component --config=packages/twenty-server/jest.config.mjs` — fix whatever it flags, typically a GraphQL enum registration.)

- [ ] **Step 7.4: Commit.**

```bash
git add packages/twenty-server/src/engine/metadata-modules/command-menu-item packages/twenty-server/src/engine/workspace-manager/twenty-standard-application
git commit -m "feat(sales-crm): SEND_WHATSAPP command menu items for Person and Opportunity"
```

---

### Task 8: Workspace backfill command for existing workspaces

New workspaces pick the commands up from the standard application; the existing production workspace needs a backfill. Model this file **line-for-line** on `packages/twenty-server/src/database/commands/upgrade-version-command/1-22/1-22-workspace-command-1775500016000-add-send-email-record-selection-command-menu-items.command.ts` (read it first — it is the exact pattern: find missing universalIdentifiers in the workspace's flatCommandMenuItemMaps, compute them from the standard application maps, create via `workspaceMigrationValidateBuildAndRunService`).

**Files:**
- Create: `packages/twenty-server/src/database/commands/upgrade-version-command/2-15/2-15-workspace-command-1800000009000-add-send-whatsapp-command-menu-items.command.ts`
- Modify: the 2-15 module that registers workspace commands (`packages/twenty-server/src/database/commands/upgrade-version-command/2-15/2-15-upgrade-version-command.module.ts`) — add the new command class to its providers, mirroring how the existing 2-15 workspace commands are registered.

- [ ] **Step 8.1: Write the command.** Copy the 1-22 file, then change: class name → `AddSendWhatsappCommandMenuItemsCommand`; decorator → `@RegisteredWorkspaceCommand('2.15.0', 1800000009000)` (match the version string format used by other 2-15 workspace commands — read one); command name → `'upgrade:2-15:add-send-whatsapp-command-menu-items'`; the identifiers constant →

```ts
const SEND_WHATSAPP_UNIVERSAL_IDENTIFIERS = [
  STANDARD_COMMAND_MENU_ITEMS.sendWhatsappToPerson.universalIdentifier,
  STANDARD_COMMAND_MENU_ITEMS.sendWhatsappToOpportunity.universalIdentifier,
];
```

and all log strings from "Send Email" → "Send WhatsApp". Everything else stays identical.

- [ ] **Step 8.2: Register + run on dev.**

```bash
npx nx typecheck twenty-server
npx nx run twenty-server:command upgrade:2-15:add-send-whatsapp-command-menu-items
```

Expected: log line "Successfully added 2 Send WhatsApp record-selection commands" (or "already exist … skipping" on re-run). If the nx command target syntax differs, invoke the same way other workspace commands are run in this repo's docs (`packages/twenty-server/docs/UPGRADE_COMMANDS.md`).

- [ ] **Step 8.3: Commit.**

```bash
git add packages/twenty-server/src/database/commands/upgrade-version-command/2-15
git commit -m "feat(sales-crm): backfill Send WhatsApp command menu items into existing workspaces"
```

---

### Task 9: Frontend — regenerate types, command component, modal, hook

**Files:**
- Create: `packages/twenty-front/src/modules/sales-crm/whatsapp/graphql/mutations/sendWhatsappMessage.ts`
- Create: `packages/twenty-front/src/modules/sales-crm/whatsapp/graphql/queries/whatsappTemplates.ts`
- Create: `packages/twenty-front/src/modules/sales-crm/whatsapp/hooks/useSendWhatsappMessage.ts`
- Create: `packages/twenty-front/src/modules/sales-crm/whatsapp/components/SendWhatsappModal.tsx`
- Create: `packages/twenty-front/src/modules/command-menu-item/engine-command/record/single-record/components/SendWhatsappSingleRecordCommand.tsx`
- Modify: `packages/twenty-front/src/modules/command-menu-item/engine-command/constants/EngineComponentKeyHeadlessComponentMap.tsx`

- [ ] **Step 9.1: Regenerate metadata types** (picks up `EngineComponentKey.SEND_WHATSAPP`, `sendWhatsappMessage`, `whatsappTemplates`). Dev server must be running with Task 6/7 code:

```bash
npx nx run twenty-front:graphql:generate --configuration=metadata
```

Expected: `packages/twenty-front/src/generated-metadata/graphql.ts` now contains `SEND_WHATSAPP` in `EngineComponentKey`.

- [ ] **Step 9.2: GraphQL documents.**

`sendWhatsappMessage.ts`:

```ts
import gql from 'graphql-tag';

export const SEND_WHATSAPP_MESSAGE = gql`
  mutation SendWhatsappMessage($input: SendWhatsappMessageInput!) {
    sendWhatsappMessage(input: $input) {
      success
      waMessageId
      error
    }
  }
`;
```

`whatsappTemplates.ts`:

```ts
import gql from 'graphql-tag';

export const WHATSAPP_TEMPLATES = gql`
  query WhatsappTemplates {
    whatsappTemplates {
      name
      language
      status
      bodyText
      variableCount
    }
  }
`;
```

- [ ] **Step 9.3: Hook** (`useSendWhatsappMessage.ts`) — mirror `packages/twenty-front/src/modules/activities/emails/hooks/useSendEmail.ts` (read it first for the exact Apollo client wiring; these documents live on the **metadata** schema, so pass the metadata Apollo client the same way other metadata-scope hooks do — check how `useSendEmail` gets its client, since `sendEmail` is also metadata-scoped, and copy that):

```ts
import { useCallback } from 'react';
import { useMutation } from '@apollo/client/react';
import { t } from '@lingui/core/macro';

import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { SEND_WHATSAPP_MESSAGE } from '@/sales-crm/whatsapp/graphql/mutations/sendWhatsappMessage';

export type SendWhatsappMessageParams = {
  personId: string;
  opportunityId?: string;
  text?: string;
  templateName?: string;
  templateLanguage?: string;
  templateBodyParams?: string[];
};

export const useSendWhatsappMessage = () => {
  const [sendWhatsappMessageMutation, { loading }] = useMutation(SEND_WHATSAPP_MESSAGE);
  const { enqueueSuccessSnackBar, enqueueErrorSnackBar } = useSnackBar();

  const sendWhatsappMessage = useCallback(
    async (params: SendWhatsappMessageParams): Promise<boolean> => {
      try {
        const result = await sendWhatsappMessageMutation({
          variables: { input: params },
        });

        if (result.data?.sendWhatsappMessage.success) {
          enqueueSuccessSnackBar({ message: t`WhatsApp message sent` });

          return true;
        }

        enqueueErrorSnackBar({
          message:
            result.data?.sendWhatsappMessage.error ?? t`Failed to send WhatsApp message`,
        });

        return false;
      } catch {
        enqueueErrorSnackBar({ message: t`Failed to send WhatsApp message` });

        return false;
      }
    },
    [sendWhatsappMessageMutation, enqueueSuccessSnackBar, enqueueErrorSnackBar],
  );

  return { sendWhatsappMessage, loading };
};
```

- [ ] **Step 9.4: Modal** (`SendWhatsappModal.tsx`). Before writing, read one modal opened by an engine command (`OverrideWorkflowDraftConfirmationModal`, found via the map file imports) and copy its `Modal` component usage/props exactly. Structure:

```tsx
import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { t } from '@lingui/core/macro';

import { Modal } from '@/ui/layout/modal/components/Modal';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { WHATSAPP_TEMPLATES } from '@/sales-crm/whatsapp/graphql/queries/whatsappTemplates';
import { useSendWhatsappMessage } from '@/sales-crm/whatsapp/hooks/useSendWhatsappMessage';

export const SEND_WHATSAPP_MODAL_ID = 'send-whatsapp-modal';

type SendWhatsappModalProps = {
  personId: string;
  opportunityId?: string;
};

export const SendWhatsappModal = ({ personId, opportunityId }: SendWhatsappModalProps) => {
  const { closeModal } = useModal();
  const { sendWhatsappMessage, loading: sending } = useSendWhatsappMessage();
  const { data, loading, error, refetch } = useQuery(WHATSAPP_TEMPLATES);

  const [mode, setMode] = useState<'template' | 'text'>('template');
  const [selectedTemplateName, setSelectedTemplateName] = useState<string | null>(null);
  const [templateParams, setTemplateParams] = useState<string[]>([]);
  const [freeText, setFreeText] = useState('');

  const templates = data?.whatsappTemplates ?? [];
  const selectedTemplate = templates.find(
    (template: { name: string }) => template.name === selectedTemplateName,
  );

  const handleSend = async () => {
    const succeeded =
      mode === 'template' && selectedTemplate
        ? await sendWhatsappMessage({
            personId,
            opportunityId,
            templateName: selectedTemplate.name,
            templateLanguage: selectedTemplate.language,
            templateBodyParams: templateParams,
          })
        : await sendWhatsappMessage({ personId, opportunityId, text: freeText });

    if (succeeded) {
      closeModal(SEND_WHATSAPP_MODAL_ID);
    }
  };
  // Render: Modal wrapper (modalId={SEND_WHATSAPP_MODAL_ID}) containing:
  //  - mode toggle (two buttons: Template / Free text)
  //  - template mode: Select of `templates` by name; on select, reset
  //    templateParams to Array(variableCount).fill(''); one TextInput per
  //    variable; preview = bodyText with {{n}} replaced by templateParams[n-1]
  //  - text mode: TextArea + hint: t`Free-form messages only deliver if the
  //    contact messaged you within the last 24 hours. Otherwise use a template.`
  //  - error state: if error, show retry button calling refetch(); text mode stays usable
  //  - footer: Cancel (closeModal) and Send (disabled while sending or when
  //    template mode has no selection / empty required params)
  // Use the same styled-components + twenty-ui inputs (Select, TextInput,
  // TextArea, Button) as the reference modal you read.
};
```

The render body must be fully implemented (the comment block above defines its required behavior — implement all of it with real twenty-ui components matching the reference modal's idiom).

- [ ] **Step 9.5: Command component** (`SendWhatsappSingleRecordCommand.tsx`) — mirror `UseAsDraftWorkflowVersionSingleRecordCommand.tsx` (read it for exact wrapper usage):

```tsx
import { isDefined } from 'twenty-shared/utils';
import { CoreObjectNameSingular } from '@/object-metadata/types/CoreObjectNameSingular';

import { useHeadlessCommandContextApi } from '@/command-menu-item/engine-command/hooks/useHeadlessCommandContextApi';
import { HeadlessEngineCommandWrapperEffect } from '@/command-menu-item/engine-command/components/HeadlessEngineCommandWrapperEffect';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import {
  SEND_WHATSAPP_MODAL_ID,
  SendWhatsappModal,
} from '@/sales-crm/whatsapp/components/SendWhatsappModal';

export const SendWhatsappSingleRecordCommand = () => {
  const { objectMetadataItem, selectedRecords } = useHeadlessCommandContextApi();
  const { openModal } = useModal();

  const selectedRecord = selectedRecords[0];
  const isOpportunity =
    objectMetadataItem?.nameSingular === CoreObjectNameSingular.Opportunity;

  // On an opportunity, the message goes to its point of contact person
  const personId = isOpportunity
    ? (selectedRecord?.pointOfContactId ?? null)
    : (selectedRecord?.id ?? null);
  const opportunityId = isOpportunity ? selectedRecord?.id : undefined;

  const handleExecute = () => {
    if (isDefined(personId)) {
      openModal(SEND_WHATSAPP_MODAL_ID);
    }
  };

  return (
    <>
      <HeadlessEngineCommandWrapperEffect execute={handleExecute} />
      {isDefined(personId) && (
        <SendWhatsappModal personId={personId} opportunityId={opportunityId} />
      )}
    </>
  );
};
```

Verify the opportunity→person field name: check the standard opportunity object's person relation (`grep -rn "pointOfContact" packages/twenty-server/src/engine/workspace-manager/twenty-standard-application | head -3`); use the actual foreign key name found. If the selected record doesn't hydrate that field, fetch it with `useFindOneRecord` (pattern in `useResolveDefaultEmailRecipient.ts`).

- [ ] **Step 9.6: Register in the map.** In `EngineComponentKeyHeadlessComponentMap.tsx`, add the import and:

```tsx
  [EngineComponentKey.SEND_WHATSAPP]: <SendWhatsappSingleRecordCommand />,
```

- [ ] **Step 9.7: Lint + typecheck.** `npx nx typecheck twenty-front && npx nx lint:diff-with-main twenty-front` — pass (auto-fix with `--configuration=fix` if needed).

- [ ] **Step 9.8: Commit.**

```bash
git add packages/twenty-front/src/modules/sales-crm packages/twenty-front/src/modules/command-menu-item packages/twenty-front/src/generated-metadata
git commit -m "feat(sales-crm): Send WhatsApp record action with template/text modal"
```

---

### Task 10: End-to-end verification on dev

- [ ] **Step 10.1:** Ensure `.env` for the dev server has the three `WHATSAPP_*` vars. If real Meta credentials are available, use them; otherwise leave unset to test the not-configured path.

- [ ] **Step 10.2:** Start frontend + backend (`yarn start` or the two nx targets). Log in (Continue with Email, prefilled credentials).

- [ ] **Step 10.3:** Open a Person record that has a whatsapp/phone number → command menu shows "Send WhatsApp" → modal opens.
  - With credentials: pick a template (or free text to a number that recently messaged the business), send, expect success snackbar, and a new WhatsApp Message record on the person's record page with status SENT and a `wamid.…` id. Also verify a deliberately bad send (free text to a cold number) produces a FAILED record and the 24-hour-window error message.
  - Without credentials: send attempt shows the "WhatsApp is not configured" error snackbar and creates a FAILED record (or no record if it fails at template-list stage — modal should show the retry state).

- [ ] **Step 10.4:** Repeat from an Opportunity record — send defaults to its point-of-contact person and the logged record links both person and opportunity.

- [ ] **Step 10.5:** Full test + lint sweep:

```bash
npx jest packages/twenty-server/src/modules/sales-crm --config=packages/twenty-server/jest.config.mjs
npx nx lint:diff-with-main twenty-server && npx nx lint:diff-with-main twenty-front
npx nx typecheck twenty-server && npx nx typecheck twenty-front
```

Expected: all pass.

- [ ] **Step 10.6:** Final commit of any fixups, then stop: deployment to crm.hamagan.com (env vars + provisioning script + upgrade command against prod) is a separate, user-approved step.

---

## Deployment notes (for the user, not part of this plan's execution)

On crm.hamagan.com after merging: set the three `WHATSAPP_*` env vars, run `node tools/sales-crm/provision-whatsapp.mjs` with prod `TWENTY_META`/`TWENTY_ORIGIN`/credentials, run the `upgrade:2-15:add-send-whatsapp-command-menu-items` command, restart. Meta prerequisites: WhatsApp Business number on a Meta Business account, permanent system-user token with `whatsapp_business_messaging` scope, and at least one APPROVED template.
