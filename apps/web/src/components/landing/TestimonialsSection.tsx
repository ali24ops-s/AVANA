import { motion } from "framer-motion";
import { Star, Quote } from "lucide-react";

const testimonials = [
  {
    name: "Sarah Mitchell",
    university: "University of Texas, Austin",
    initials: "SM",
    color: "from-pink-400 to-rose-500",
    testimonial:
      "AVANA saved my life during finals week. The AI flashcards helped me memorize 200+ drug mechanisms in 3 days.",
    rating: 5,
  },
  {
    name: "Marcus Chen",
    university: "University of California, San Francisco",
    initials: "MC",
    color: "from-blue-400 to-indigo-500",
    testimonial:
      "I was skeptical about AI study tools, but the explanations are pharmacy-specific and actually accurate. Game changer for PharmD students.",
    rating: 5,
  },
  {
    name: "Aisha Patel",
    university: "Ohio State University",
    initials: "AP",
    color: "from-emerald-400 to-teal-500",
    testimonial:
      "The quiz feature is amazing. It identifies exactly what I don't know and focuses my studying there. My exam scores improved by 2 letter grades.",
    rating: 5,
  },
];

export function TestimonialsSection() {
  return (
    <section className="py-24 px-6 bg-[var(--color-surface)]">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl font-bold mb-4">
            Loved by Pharmacy Students
          </h2>
          <p className="text-xl text-[var(--color-text-muted)] max-w-2xl mx-auto">
            Join thousands of students who transformed their study routine with
            AVANA.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8">
          {testimonials.map((testimonial, index) => (
            <motion.div
              key={testimonial.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              whileHover={{ y: -5 }}
              className="bg-[var(--color-background)] rounded-2xl p-8 border border-[var(--color-border)]"
            >
              {/* Quote Icon */}
              <Quote className="w-10 h-10 text-indigo-200 dark:text-indigo-800 mb-6" />

              {/* Stars */}
              <div className="flex gap-1 mb-4">
                {[...Array(testimonial.rating)].map((_, i) => (
                  <Star
                    key={i}
                    className="w-5 h-5 fill-yellow-400 text-yellow-400"
                  />
                ))}
              </div>

              {/* Testimonial */}
              <p className="text-[var(--color-text-muted)] leading-relaxed mb-6">
                "{testimonial.testimonial}"
              </p>

              {/* Author */}
              <div className="flex items-center gap-4">
                <div
                  className={`w-12 h-12 rounded-full bg-gradient-to-br ${testimonial.color} flex items-center justify-center text-white font-semibold`}
                >
                  {testimonial.initials}
                </div>
                <div>
                  <p className="font-semibold">{testimonial.name}</p>
                  <p className="text-sm text-[var(--color-text-muted)]">
                    {testimonial.university}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
