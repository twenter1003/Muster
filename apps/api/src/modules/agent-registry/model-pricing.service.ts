import { Injectable } from '@nestjs/common';

/** 1M 토큰당 USD 단가 */
export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  blendedPerMillion: number;
  /**
   * 캐시 읽기·쓰기 단가. 가이드(2장 단가표)에 실린 모델만 채운다 —
   * 출처가 없는 모델은 비워 두고, 비울 경우 캐시 토큰을 정규 입력가로 계산한다.
   * 근거 없는 숫자를 지어내느니 비싸게 잡는 쪽이 낫다.
   */
  cacheReadPerMillion?: number;
  cacheWritePerMillion?: number;
}

/**
 * 2026년 기준 주요 프론티어 LLM 토큰 단가표 (USD / 1M 토큰).
 * 단일 원천: docs/LLM_ECOSYSTEM_GUIDE.md
 *
 * blendedPerMillion: 일반적인 에이전틱 코딩 워크플로(입력 80%, 출력 20%) 기준 블렌디드 단가.
 */
export const LLM_PRICING_TABLE: Record<string, ModelPricing> = {
  // Google Gemini 시리즈 (캐시 쓰기는 가이드상 "읽기가 + 저장료"라 저장료를 뺀 값만 싣는다)
  'gemini-3.8-flash': {
    inputPerMillion: 0.75,
    outputPerMillion: 3.75,
    blendedPerMillion: 1.35,
    cacheReadPerMillion: 0.075,
    cacheWritePerMillion: 0.075,
  },
  'gemini-3.7-flash': {
    inputPerMillion: 0.75,
    outputPerMillion: 3.75,
    blendedPerMillion: 1.35,
    cacheReadPerMillion: 0.075,
    cacheWritePerMillion: 0.075,
  },
  'gemini-3.6-flash': {
    inputPerMillion: 0.5,
    outputPerMillion: 2.5,
    blendedPerMillion: 0.9,
    cacheReadPerMillion: 0.05,
    cacheWritePerMillion: 0.05,
  },
  'gemini-3.1-flash-lite': {
    inputPerMillion: 0.15,
    outputPerMillion: 0.6,
    blendedPerMillion: 0.24,
    cacheReadPerMillion: 0.015,
    cacheWritePerMillion: 0.015,
  },
  'gemini-2.5-pro': {
    inputPerMillion: 1.25,
    outputPerMillion: 5.0,
    blendedPerMillion: 2.0,
    cacheReadPerMillion: 0.3125,
    cacheWritePerMillion: 0.3125,
  },

  // Anthropic Claude 시리즈 (캐시 쓰기 +25%, 읽기 90% 할인 — Fable만 97.5%)
  'claude-fable-5-1': {
    inputPerMillion: 10.0,
    outputPerMillion: 50.0,
    blendedPerMillion: 18.0,
    cacheReadPerMillion: 0.25,
    cacheWritePerMillion: 12.5,
  },
  'claude-fable-5': {
    inputPerMillion: 10.0,
    outputPerMillion: 50.0,
    blendedPerMillion: 18.0,
    cacheReadPerMillion: 0.25,
    cacheWritePerMillion: 12.5,
  },
  'claude-opus-5': {
    inputPerMillion: 5.0,
    outputPerMillion: 25.0,
    blendedPerMillion: 9.0,
    cacheReadPerMillion: 0.5,
    cacheWritePerMillion: 6.25,
  },
  'claude-sonnet-5': {
    inputPerMillion: 2.0,
    outputPerMillion: 10.0,
    blendedPerMillion: 3.6,
    cacheReadPerMillion: 0.2,
    cacheWritePerMillion: 2.5,
  },
  'claude-haiku-5': {
    inputPerMillion: 0.4,
    outputPerMillion: 2.0,
    blendedPerMillion: 0.72,
    cacheReadPerMillion: 0.04,
    cacheWritePerMillion: 0.5,
  },

  // OpenAI 시리즈 (가이드에 실린 세 모델만 캐시 단가를 채운다)
  'gpt-6-astra': {
    inputPerMillion: 10.0,
    outputPerMillion: 50.0,
    blendedPerMillion: 18.0,
    cacheReadPerMillion: 1.0,
    cacheWritePerMillion: 10.0,
  },
  'gpt-6': { inputPerMillion: 10.0, outputPerMillion: 50.0, blendedPerMillion: 18.0 },
  'gpt-5.6-sol': { inputPerMillion: 3.0, outputPerMillion: 15.0, blendedPerMillion: 5.4 },
  'gpt-5.6-terra': {
    inputPerMillion: 2.0,
    outputPerMillion: 12.0,
    blendedPerMillion: 4.0,
    cacheReadPerMillion: 0.2,
    cacheWritePerMillion: 2.0,
  },
  'gpt-5.6-luna': {
    inputPerMillion: 0.2,
    outputPerMillion: 1.2,
    blendedPerMillion: 0.4,
    cacheReadPerMillion: 0.02,
    cacheWritePerMillion: 0.2,
  },

  // DeepSeek 시리즈 (가이드 단가표에 없어 캐시 단가를 비워 둔다)
  'deepseek-chat': { inputPerMillion: 0.14, outputPerMillion: 0.28, blendedPerMillion: 0.17 },
  'deepseek-reasoner': { inputPerMillion: 0.55, outputPerMillion: 2.19, blendedPerMillion: 0.88 },
};

/** 단가표에 일치하지 않는 미식별 모델의 안전 기본값 ($2.00 / 1M 토큰) */
export const DEFAULT_FALLBACK_PRICING: ModelPricing = {
  inputPerMillion: 1.5,
  outputPerMillion: 4.0,
  blendedPerMillion: 2.0,
};

export interface CalculateCostOptions {
  tokens?: number;
  model?: string;
  agentName?: string;
  inputTokens?: number;
  outputTokens?: number;
  /** 캐시에서 다시 읽은 토큰. 정규 입력가의 10% 안팎이라 따로 세지 않으면 비용이 크게 부풀려진다. */
  cacheReadTokens?: number;
  /** 캐시에 새로 써 넣은 토큰. Claude 계열은 정규 입력가보다 25% 비싸다. */
  cacheWriteTokens?: number;
}

@Injectable()
export class ModelPricingService {
  /**
   * 모델명이나 에이전트명을 바탕으로 가장 적합한 단가 스펙을 찾아 반환한다.
   */
  resolvePricing(model?: string, agentName?: string): { modelCode: string; pricing: ModelPricing } {
    const rawTarget = (model || '').toLowerCase().trim();
    if (rawTarget && LLM_PRICING_TABLE[rawTarget]) {
      return { modelCode: rawTarget, pricing: LLM_PRICING_TABLE[rawTarget] };
    }

    // 모델 코드 부분 매칭
    for (const [code, pricing] of Object.entries(LLM_PRICING_TABLE)) {
      if (rawTarget && (rawTarget.includes(code) || code.includes(rawTarget))) {
        return { modelCode: code, pricing };
      }
    }

    // 에이전트 이름 기반 기본 모델 추론
    const agent = (agentName || '').toLowerCase().trim();
    if (agent.includes('claude') || agent === 'claude-code') {
      return { modelCode: 'claude-sonnet-5', pricing: LLM_PRICING_TABLE['claude-sonnet-5'] };
    }
    if (agent.includes('antigravity') || agent.includes('gemini')) {
      return { modelCode: 'gemini-3.6-flash', pricing: LLM_PRICING_TABLE['gemini-3.6-flash'] };
    }
    if (agent.includes('deepseek')) {
      return { modelCode: 'deepseek-chat', pricing: LLM_PRICING_TABLE['deepseek-chat'] };
    }
    if (
      agent.includes('openai') ||
      agent.includes('gpt') ||
      agent.includes('cursor') ||
      agent.includes('copilot') ||
      agent.includes('cline') ||
      agent.includes('windsurf')
    ) {
      return { modelCode: 'gpt-5.6-terra', pricing: LLM_PRICING_TABLE['gpt-5.6-terra'] };
    }

    return { modelCode: 'custom', pricing: DEFAULT_FALLBACK_PRICING };
  }

  /**
   * 소모 토큰에 대한 USD 비용을 계산하여 DB numeric(12, 4) 규격의 문자열로 반환한다.
   */
  calculateCost(options: CalculateCostOptions): string {
    const { pricing } = this.resolvePricing(options.model, options.agentName);
    const totalTokens = options.tokens ?? 0;
    const inputTokens = options.inputTokens;
    const outputTokens = options.outputTokens;
    const cacheReadTokens = options.cacheReadTokens ?? 0;
    const cacheWriteTokens = options.cacheWriteTokens ?? 0;

    if (
      totalTokens <= 0 &&
      (!inputTokens || inputTokens <= 0) &&
      (!outputTokens || outputTokens <= 0) &&
      cacheReadTokens <= 0 &&
      cacheWriteTokens <= 0
    ) {
      return '0.0000';
    }

    /*
     * 넷 중 하나라도 오면 항목별로 센다. "입력과 출력이 둘 다 와야" 항목별로 세게 두면,
     * 캐시 토큰만 보고된 실행이 합산 분기로 빠져 0원이 된다.
     */
    const itemized =
      inputTokens !== undefined ||
      outputTokens !== undefined ||
      cacheReadTokens > 0 ||
      cacheWriteTokens > 0;

    let rawCost = 0;
    if (itemized) {
      /*
       * 캐시 단가를 모르는 모델은 정규 입력가로 센다. 실제보다 비싸게 잡히지만,
       * 출처 없는 할인율을 지어내 싸게 보이게 하는 것보다 낫다.
       */
      const readRate = pricing.cacheReadPerMillion ?? pricing.inputPerMillion;
      const writeRate = pricing.cacheWritePerMillion ?? pricing.inputPerMillion;
      rawCost =
        ((inputTokens ?? 0) * pricing.inputPerMillion +
          cacheWriteTokens * writeRate +
          cacheReadTokens * readRate +
          (outputTokens ?? 0) * pricing.outputPerMillion) /
        1_000_000;
    } else {
      rawCost = (totalTokens * pricing.blendedPerMillion) / 1_000_000;
    }

    // 토큰이 소모되었으나 소수점 4자리 미만(예: $0.00002)으로 떨어질 경우 최소 $0.0001 보존
    if (rawCost > 0 && rawCost < 0.0001) {
      return '0.0001';
    }

    return rawCost.toFixed(4);
  }

  /** 전체 단가표 반환 */
  getTable(): Record<string, ModelPricing> {
    return LLM_PRICING_TABLE;
  }
}
