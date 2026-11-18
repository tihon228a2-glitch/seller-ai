
const express = require('express');
const path = require('path');

const app = express();

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'SELLER AI' });
});

function clean(value, max = 2000) {
  return String(value || '').trim().slice(0, max);
}

function parseFeatures(features) {
  return features
    .split(/[,;\n]+/)
    .map(x => x.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .slice(0, 10);
}

function fallback(name, category, features) {
  const specs = parseFeatures(features);
  const description = specs.length
    ? `${name}${category ? ` из категории «${category}»` : ''}. Характеристики: ${specs.join('; ')}.`
    : `${name}. Добавьте характеристики товара для создания описания.`;

  return {
    title: `${name} — описание и характеристики`.slice(0, 120),
    description,
    desc: description,
    benefits: specs.map(x => `Характеристика: ${x}`),
    keywords: [name, category, ...specs].filter(Boolean).join(', '),
    verification: {
      available: false,
      score: null,
      claims: [],
      note: 'AI-проверка недоступна в демо-режиме.'
    },
    demo: true
  };
}

app.post('/api/generate', async (req, res) => {
  const {
    platform = 'Wildberries',
    name = '',
    category = '',
    features = '',
    audience = 'для повседневного использования',
    tone = 'Убедительный и понятный'
  } = req.body || {};

  const product = clean(name, 200);
  const productCategory = clean(category, 200);
  const productFeatures = clean(features, 2000);
  const targetAudience = clean(audience, 300);
  const style = clean(tone, 100);
  const marketplace = clean(platform, 100);

  if (!product) {
    return res.status(400).json({ error: 'Название товара обязательно' });
  }

  const base = process.env.AI_BASE_URL;
  const key = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL;

  if (base && key && model) {
    try {
      const response = await fetch(
        base.replace(/\/+$/, '') + '/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`
          },
          signal: AbortSignal.timeout(30000),
          body: JSON.stringify({
            model,
            temperature: 0.2,
            messages: [
              {
                role: 'system',
                content: `
Ты редактор карточек товаров маркетплейсов.

Создай заголовок, описание, преимущества и SEO-фразы.

Используй исключительно предоставленные характеристики.
Не выдумывай функции, свойства, материалы, размеры,
комплектацию и технические возможности.

Затем проверь каждое фактическое утверждение
в созданном заголовке, описании и преимуществах.

Статусы:
- supported: прямо подтверждается входными данными.
- unverified: отсутствует подтверждение во входных данных.

Не считай общие рекламные слова доказанными фактами.
Не выдавай предположение за подтверждённую характеристику.

Оценка score — процент утверждений со статусом supported.
Если фактических утверждений нет, score должен быть null.

Верни только JSON:
{
  "title": "Заголовок",
  "description": "Описание",
  "benefits": ["Преимущество"],
  "keywords": ["Фраза"],
  "verification": {
    "score": 80,
    "claims": [
      {
        "text": "Bluetooth 5.3",
        "status": "supported",
        "reason": "Указано во входных характеристиках"
      },
      {
        "text": "Низкая задержка",
        "status": "unverified",
        "reason": "Такое свойство не указано во входных данных"
      }
    ]
  }
}
`
              },
              {
                role: 'user',
                content: JSON.stringify({
                  platform: marketplace,
                  name: product,
                  category: productCategory,
                  features: productFeatures,
                  audience: targetAudience,
                  tone: style
                })
              }
            ]
          })
        }
      );

      if (!response.ok) {
        throw new Error(`AI provider returned ${response.status}`);
      }

      const data = await response.json();
      let content = data.choices?.[0]?.message?.content || '';

      content = content
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();

      const result = JSON.parse(content);

      if (
        typeof result.title !== 'string' ||
        typeof result.description !== 'string' ||
        !Array.isArray(result.benefits) ||
        !Array.isArray(result.keywords)
      ) {
        throw new Error('Invalid AI response format');
      }

      const rawVerification = result.verification || {};
      const claims = Array.isArray(rawVerification.claims)
        ? rawVerification.claims
            .filter(x =>
              x &&
              typeof x.text === 'string' &&
              ['supported', 'unverified'].includes(x.status)
            )
            .map(x => ({
              text: clean(x.text, 300),
              status: x.status,
              reason: clean(x.reason, 500)
            }))
            .slice(0, 30)
        : [];

      const checked = claims.filter(x => x.status === 'supported').length;
      const score = claims.length
        ? Math.round(checked / claims.length * 100)
        : null;

      return res.json({
        result: {
          title: clean(result.title, 120),
          description: clean(result.description, 5000),
          desc: clean(result.description, 5000),
          benefits: result.benefits
            .filter(x => typeof x === 'string')
            .map(x => clean(x, 300))
            .filter(Boolean)
            .slice(0, 7),
          keywords: result.keywords
            .filter(x => typeof x === 'string')
            .map(x => clean(x, 100))
            .filter(Boolean)
            .slice(0, 20)
            .join(', '),
          verification: {
            available: true,
            score,
            claims,
            note: 'Оценка показывает соответствие исходным данным, а не фактическую проверку товара.'
          },
          demo: false
        }
      });

    } catch (error) {
      console.error('AI generation failed:', error.message);
    }
  }

  return res.json({
    result: fallback(product, productCategory, productFeatures)
  });
});

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`SELLER AI running on port ${port}`);
});
