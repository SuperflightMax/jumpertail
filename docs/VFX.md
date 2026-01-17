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
- `life` — диапазон жизни `{ min, max }`.
- `scaleFrom`, `scaleTo` — диапазоны масштаба на старте/конце жизни.
- `alphaFrom`, `alphaTo` — диапазоны прозрачности на старте/конце жизни.
- `rotationFrom`, `rotationTo` — диапазоны углов в градусах (start/end).
- `angularSpeed` — диапазон угловой скорости в градусах/сек.
- `speed.vx`, `speed.vy` — диапазоны начальных скоростей по осям.
- `gravity` — вектор ускорения `{ x, y }`.
- `airDrag` — замедление скорости (0–1).
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
- расширенные контролы слоя (spawn/max, life ranges, scale/alpha/rotation transitions, speed vector/direction, follow/aura/spark параметры, цвета),
- глобальные контролы (snap/grid, global multipliers),
- блок генератора платформ (min/max gap, размеры, диапазон по X, стартовое количество, respawn/fade/descent, цвета платформ),
- монитор FPS + количества живых партиклов поверх канваса (на тёмной подложке),
- `Save`/`Load` сохраняют и загружают tail config из `localStorage`,
- `Reset` откатывает на дефолтный конфиг,
- `Dump JSON` выводит текущий tail config в консоль.
- Включён выбор конфиг-файла, пиксельной маски и текстур для слоёв.
