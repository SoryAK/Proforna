const fs = require('fs');
const file = 'src/components/onboarding-flow.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /const Icon = step\.icon;\s*return \(\s*<Link key=\{step\.id\} href=\{step\.href\}>\s*([\s\S]*?)<\/Link>\s*\);\s*}\)/,
  \const Icon = step.icon;
            
            const content = (
              
            );

            if (step.id === "profile" && onProfileClick) {
              return (
                <button
                  key={step.id}
                  onClick={onProfileClick}
                  className="w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xl"
                >
                  {content}
                </button>
              );
            }

            return (
              <Link key={step.id} href={step.href}>
                {content}
              </Link>
            );
          })\
);

fs.writeFileSync(file, content);
console.log("Done");
