# Skills para mejorar el código

Inventario de skills y agentes disponibles para detectar bugs y mejorar SecOps Explorer. Todavía no se aplicó ninguno. Marcá con `sí` o `no` en **Aplicar**, y después un agente ejecuta los aprobados en orden.

La descripción de cada uno sale del listado de la sesión. Los marcados con `*` no traen descripción: su uso está inferido del nombre y hay que confirmarlo al abrirlo.

## Detectar bugs

| # | Skill o agente | Sobre qué | Qué aporta | Costo | Aplicar |
| --- | --- | --- | --- | --- | --- |
| 1 | `code-review` (effort `high`) | Rama `fix/dmarc-concept-controls` y el motor | Busca errores de lógica en el diff; con `--fix` los aplica | Medio | |
| 2 | Agente `review-reliability` | `lib/engine/` y sus tests | Determinismo, casos borde, valor real de los tests | Medio | |
| 3 | `security-review` | Todo el repo, foco en URLs compartidas y CSP | Revisión de seguridad del código propio | Medio | |
| 4 | Agente `review-risk` | `lib/security/`, `share.ts`, dependencias | Exposición de datos, dependencias, permisos | Medio | |
| 5 | `judgment-day` (agentes `jd-judge-a` y `jd-judge-b`) | Motor completo | Dos revisores ciegos y un agente de arreglos | Alto | |

## Mejorar los tests

| # | Skill o agente | Sobre qué | Qué aporta | Costo | Aplicar |
| --- | --- | --- | --- | --- | --- |
| 6 | `engineering:testing-strategy`* | Plan de la ola de QA | Qué testear y en qué nivel (unit, componente, e2e) | Bajo | |
| 7 | `mattpocock-skills:tdd`* o `superpowers:test-driven-development`* | Escenario de headers web | Disciplina de rojo a verde para el próximo escenario | Bajo | |
| 8 | `run` | Sitio en local | Levanta la app y confirma los cambios en la app real | Bajo | |

## Mejorar el código

| # | Skill o agente | Sobre qué | Qué aporta | Costo | Aplicar |
| --- | --- | --- | --- | --- | --- |
| 9 | `simplify` | Cambios recientes en `lib/engine/` y `components/` | Reutilización, simplificación y eficiencia; aplica los arreglos, no busca bugs | Medio | |
| 10 | `engineering:tech-debt` | Todo el repo | Deuda técnica priorizada | Medio | |
| 11 | `mattpocock-skills:codebase-design`* | Motor generalizado (SSH y DMARC) | Diseño del módulo antes de sumar más escenarios | Medio | |
| 12 | `mattpocock-skills:domain-modeling`* | Tipos de escenario, actor y control | Modelo de dominio más claro | Medio | |
| 13 | Agente `review-readability` | Todo lo nuevo | Nombres, complejidad, mantenibilidad | Bajo | |

## Mejorar el front

| # | Skill o agente | Sobre qué | Qué aporta | Costo | Aplicar |
| --- | --- | --- | --- | --- | --- |
| 14 | `design:accessibility-review`* | Páginas después del rediseño | Contraste, teclado, lectores de pantalla | Bajo | |
| 15 | `design:design-critique`* | Páginas después del rediseño | Crítica visual y de jerarquía | Bajo | |
| 16 | `design:ux-copy`* | Textos de controles y resultados | Mejora del texto en español | Bajo | |

## Para cuando aparezca un bug

No hace falta aplicarlos ahora; se usan cuando algo falla.

| Skill | Uso |
| --- | --- |
| `superpowers:systematic-debugging` | Encontrar la causa antes de proponer un arreglo |
| `engineering:debug` | Sesión guiada: reproducir, aislar, diagnosticar y arreglar |
| `mattpocock-skills:diagnosing-bugs`* | Alternativa para diagnóstico |

## Orden sugerido

1. `code-review` y `review-reliability`, antes de la ola de QA.
2. `testing-strategy`, para que QA trabaje con un plan.
3. `security-review`, con los headers ya integrados.
4. `accessibility-review` y `design-critique`, al terminar el rediseño.
5. `simplify`, al final, para no limpiar código que todavía va a cambiar.

Costo estimado: Bajo, menos de 100k tokens; Medio, 100k a 300k; Alto, más de 300k. Son estimaciones sin medir.
