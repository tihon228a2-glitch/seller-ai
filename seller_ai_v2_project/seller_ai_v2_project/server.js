

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
    : `${name}. Добавьте характеристики товара для создания подробного описания.`;

  return {
    title: `${name} — описание и характеристики`.slice(0, 120),
    description,
    desc: description,
    benefits: specs.length
      ? specs.map(x => `Характеристика товара: ${x}`)
      : ['Добавьте характеристики товара для создания преимуществ.'],
    keywords: [name, category, ...specs].filter(Boolean).join(', '),
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
            temperature: 0.3,
            messages: [
              {
                role: 'system',
                content: `
Ты профессиональный редактор карточек товаров
для маркетплейсов Wildberries и Ozon.

Пиши исключительно грамотным русским языком.

Твоя задача:
1. Создать понятный заголовок до 120 символов.
2. Написать подробное описание товара.
3. Составить преимущества на основе предоставленных характеристик.
4. Подобрать релевантные поисковые фразы.

ОБЯЗАТЕЛЬНЫЕ ПРАВИЛА:

- Используй только факты из входных данных.
- Никогда не выдумывай функции, материалы, размеры,
  комплектацию, сроки работы и другие характеристики.
- Не приписывай товару быструю зарядку, защиту от воды,
  высокое качество звука или другие свойства,
  если они прямо не указаны.
- Не превращай характеристику в неподтверждённое обещание.
- Не используй слова «премиальный», «лучший»,
  «идеальный», если это не подтверждено данными.
- Сохраняй точные обозначения и числа:
  например, Bluetooth 5.3 нельзя менять на Bluetooth 5.
- Не добавляй характеристики в SEO-фразы,
  если их нет во входных данных.
- Не повторяй одинаковые ключевые слова.
- Не добавляй нерелевантные запросы вроде «подарок»
  или «для всех».
- Учитывай выбранный маркетплейс, аудиторию и стиль.
- Если данных мало, пиши кратко и честно.
- Не нужно искусственно создавать 7 преимуществ,
  если для них недостаточно подтверждённых фактов.
- Не используй Markdown.

Верни исключительно корректный JSON следующего вида:

{
  "title": "Заголовок товара",
  "description": "Описание товара",
  "benefits": ["Преимущество 1", "Преимущество 2"],
  "keywords": ["Поисковая фраза 1", "Поисковая фраза 2"]
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
        const errorText = await response.text();
        throw new Error(
          `AI provider returned ${response.status}: ${errorText.slice(0, 300)}`
        );
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
      productFeatures
    )
  });
});

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`SELLER AI running on port ${port}`);
});
