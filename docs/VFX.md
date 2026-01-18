# VFX / PARTICLES

– простая particle system
– эффекты отдельными файлами
– можно использовать PNG формы
– есть глубина / параллакс

Codex обязан описывать
что и как он реализовал.

## Реализация

- Партиклы создаются при прыжке с платформы как burst.
- Партиклы управляются через отдельный `particlesystem.js` с пулом для высокой плотности эффектов.
- Эффекты вынесены в отдельные скрипты: `particletail.js` (layered tail) и `particleplatform.js` (burst платформы).
- Хвост — многослойный поток частиц (follow/aura/spark) с независимыми параметрами, цветовой логикой и общей интенсивностью.
- Частицы хвоста могут быть снапнуты к grid-сетке для dot-matrix / pixel ощущений.
- Доступна пиксельная оверлей-маска для экрана с фиксированной сеткой и повторяемым паттерном.
- Текстуры партиклов окрашиваются выбранными градиентами цвета (как и геометрические формы).
- Параметры хвоста и платформы настраиваются в `config.js` (слои, скорость спавна, жизнь, размер, формы, цвета).
- Параллакс реализован фоновыми слоями с точками, двигающимися медленнее камеры.

## Layered Tail (Tail v2)

Настройки в `config.js` → `particles.tail`:

- `snapToGrid`, `gridSize` — снап к сетке.
- `growthPerJump` — прирост интенсивности за прыжок.
- `globalAlpha`, `globalSpawnMul`, `globalLifeMul`, `globalSizeMul` — общие множители.
- `progressStages` — таблица прогресса (по `intensity`) для множителей spawn/life/size.
- `layers[]` — массив слоёв (любое количество).

Ключевые поля слоя:

- `enabled`, `enabledAt` — включение слоя и порог прогресса.
- `mode`: `follow` | `aura` | `spark`.
- `shape`: `square` | `circle`.
- `texture` — имя текстуры из `assets/textures/particles/` (или `null` для фигур).
- `baseSpawnRate`, `maxSpawnRate`.
- `size` — базовый размер в пикселях (текстуры и фигуры приводятся к этому размеру).
- `life` — диапазон жизни `{ min, max }`.
- `scaleFrom`, `scaleTo` — диапазоны масштаба относительно `size` на старте/конце жизни.
- `alphaFrom`, `alphaTo` — диапазоны прозрачности на старте/конце жизни.
- `rotationFrom`, `rotationTo` — диапазоны углов в градусах (start/end).
- `angularSpeed` — диапазон угловой скорости в градусах/сек.
- `speed.angle`, `speed.magnitude` — диапазоны направления (градусы) и скорости.
- `gravity` — вектор ускорения `{ x, y }`.
- `airDrag` — множитель торможения скорости за шаг обновления (`v *= 1 - airDrag`).
- `offsetRadius`, `offsetBias`, `followStrength`.
- `colorMode`: `platform` | `fixed` | `palette`:
  - `platform` — берём текущий `tailColor` из игры.
  - `fixed` — фиксированный переход `colorFrom` → `colorTo`.
  - `palette` — случайные цвета из палитры + смешение с `tailColor` через `paletteBlend`.

Переходы:
- `colorFrom` → `colorTo`
- `alphaFrom` → `alphaTo`
- `scaleFrom` → `scaleTo`
- `rotationFrom` → `rotationTo`

## Tail Viewer (debug)

Доступен в `debug.html`, включается клавишей `V` (можно отключить через `particles.tail.viewer.enabled`).

Функции:
- раскладка колонок: Game → Layers → Rest (сбоку от канваса),
- выбор слоя через компактные кнопки (1, 2, 3...),
- расширенные контролы слоя (spawn/max, life ranges, scale/alpha/rotation transitions, speed angle/magnitude, follow/aura/spark параметры, цвета),
- глобальные контролы (snap/grid, global multipliers),
- блок генератора платформ (min/max gap, размеры, диапазон по X, стартовое количество, respawn/fade/descent, цвета платформ),
- монитор FPS + количества живых партиклов поверх канваса (на тёмной подложке),
- `Save` скачивает текущий конфиг игры целиком в файл `default_YYYYMMDD_HHMMSS.json`,
- `Load` загружает выбранный JSON и применяет его к игре сразу,
- `Reset` скачивает текущий конфиг и затем загружает `configs/default.json`.
- Добавлен слайдер прогресса хвоста с отображением значения.
- Убран выбор конфиг-файлов и кнопка `Dump JSON`.
- Включены настройки пиксельной маски и выбор текстур для слоёв.
