import { FastifyInstance } from 'fastify';
import { prisma } from "./prisma";
import { z } from 'zod';
import dayjs from 'dayjs';

export async function appRoutes(app: FastifyInstance) {

    app.post('/habits', async (request) => {
        const createHabitBody = z.object({
            title: z.string(),
            weekDays: z.array(
                z.number().min(0).max(6)
            )
        })
        const { title, weekDays } = createHabitBody.parse(request.body)

        const today = dayjs().startOf('day').toDate()

        await prisma.habit.create({
            data: {
                title,
                created_at: today,
                weekDays: {
                    create: weekDays.map(weekDay => {
                        return { week_day: weekDay }
                    })
                }
            }
        })
    })

    app.get('/day', async (request) => {
        const getDayParams = z.object({
            date: z.coerce.date()
        })

        const { date } = getDayParams.parse(request.query)

        const parsedDate = dayjs(date).startOf('day')
        const weekDay = parsedDate.get('day')


        const possibleHabits = await prisma.habit.findMany({
            where: {
                created_at: {
                    lte: date,
                },
                weekDays: {
                    some: {
                        week_day: weekDay
                    }
                }
            }
        })

        const day = await prisma.day.findFirst({
            where: {
                date: parsedDate.toDate()
            }, include: {
                dayHabits: true,
            }
        })
        console.log(date, parsedDate.toDate())
        const completedHabits = day?.dayHabits.map(dayHabit => {
            return dayHabit.habit_id
        })

        return {
            possibleHabits,
            completedHabits
        }
    })

    app.patch('/habits/:id/toggle', async (request) => {
        const toggleHabitParams = z.object({
            id: z.string().uuid(),
        })

        const { id } = toggleHabitParams.parse(request.params)
        const today = dayjs().startOf('day').toDate()

        let day = await prisma.day.findUnique({
            where: {
                date: today,
            }
        })

        if (!day) {
            day = await prisma.day.create({
                data: {
                    date: today,
                }
            })
        }
        const dayHabit = await prisma.dayHabit.findUnique({
            where: {
                day_id_habit_id: {
                    day_id: day.id,
                    habit_id: id,
                }
            }
        })

        if (dayHabit) {
            await prisma.dayHabit.delete({
                where: {
                    id: dayHabit.id,
                }
            })
        } else {
            await prisma.dayHabit.create({
                data: {
                    day_id: day.id,
                    habit_id: id,
                }
            })
        }
        return (dayHabit)
    })

    app.get('/summary', async () => {
        const summary = await prisma.$queryRaw`
            select d.id, d.date,
            (select cast(count(*) as float) from day_habits dh where dh.day_id = d.id) as completed,
            (select cast(count(*) as float) from habit_week_days hwd join habits h where hwd.week_day = cast(strftime('%w', d.date/1000.0, 'unixepoch') as int)) as amount
             from days d
            `

        return summary
    })

}
