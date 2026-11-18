
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

function fallback(name, category, features, audience) {
  const specs = parseFeatures(features);

  const description = specs.length
    ? `${name}${category ? ` из категории «${category}»` : ''}. Характеристики: ${specs.join('; ')}.`
    : `${name}. Добавьте характеристики товара, чтобы подготовить подробное описание для покупателей.`;

  return {
    title: `${name} — характеристики и описание товара`.slice(0, 120),
    description,
    desc: description,
    benefits: specs.length
      ? specs.map(spec => `Характеристика: ${spec}`)
      : ['Добавьте характеристики товара для формирования преимуществ.'],
    keywords: [
      name,
      category,
      ...specs
    ].filter(Boolean).join(', '),
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
    return res.status(400).json({
      error: 'Название товара обязательно'
    });
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
            temperature: 0.65,
            messages: [
              {
                role: 'system',
                content: `
Ты профессиональный редактор карточек товаров
для маркетплейсов.

Пиши исключительно грамотным русским языком.

Создавай:
1. Продающий заголовок до 120 символов.
2. Подробное описание товара.
3. От 5 до 7 преимуществ, если информации достаточно.
4. Релевантные SEO-поисковые фразы.

СТРОГИЕ ПРАВИЛА:
- Не выдумывай характеристики.
- Не придумывай материалы, размеры и функции.
- Не используй бессмысленные рекламные фразы.
- Исправляй грамматические ошибки.
- Не повторяй одни и те же слова.
- Сохраняй версии и числа, например Bluetooth 5.3.
- Если информации недостаточно, не делай неподтверждённых заявлений.
- Не добавляй Markdown.

Верни только JSON:
{
  "title": "Заголовок",
  "description": "Описание",
  "benefits": ["Преимущество 1"],
  "keywords": ["Фраза 1", "Фраза 2"]
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

      const finalResult = {
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
        demo: false
      };

      return res.json({ result: finalResult });

    } catch (error) {
      console.error('AI generation failed:', error.message);
    }
  }

  return res.json({
    result: fallback(
      product,
      productCategory,
      productFeatures,
      targetAudience
    )
  });
});

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`SELLER AI running on port ${port}`);
});
