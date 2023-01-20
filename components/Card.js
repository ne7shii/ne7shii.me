import Image from './Image'
import Link from './Link'

const Card = ({ title, description, imgSrc, href, visible, tags }) => (
  <div className="md p-4 md:w-1/2" style={{ maxWidth: '544px' }}>
    <div
      className={`${
        imgSrc && 'h-full'
      }  overflow-hidden rounded-md border-2 border-gray-200 border-opacity-60 dark:border-gray-700`}
    >
      {imgSrc &&
        (href ? (
          <Link href={href} aria-label={`Link to ${title}`}>
            <Image
              alt={title}
              src={imgSrc}
              className="bg-slate-500 object-cover object-center md:h-36 lg:h-48"
              width={544}
              height={306}
            />
          </Link>
        ) : (
          <Image
            alt={title}
            src={imgSrc}
            className="object-cover object-center md:h-36 lg:h-48"
            width={544}
            height={306}
          />
        ))}
      <div className="p-6">
        <div className="flex justify-between">
          <h2 className="mb-3 text-2xl font-bold leading-8 tracking-tight">
            {href ? (
              <Link href={href} aria-label={`Link to ${title}`}>
                {title}
              </Link>
            ) : (
              title
            )}
          </h2>
          <div
            className={`flex h-fit items-center justify-center rounded-full px-2 ${
              visible === 'private'
                ? 'border-2 border-none bg-red-200 dark:bg-red-900'
                : 'border-2 border-none bg-green-200 dark:bg-green-700'
            }`}
          >
            {visible}
          </div>
        </div>

        <p className="prose mb-3 max-w-none text-gray-500 dark:text-gray-400">{description}</p>
        {tags && (
          <div className="flex">
            {tags.map((tag) => (
              <div
                key={`${title}-${tag}`}
                className="mx-1 rounded-full bg-blue-200 px-2  dark:bg-blue-900"
              >
                {tag}
              </div>
            ))}
          </div>
        )}
        {/* {href && (
          <Link
            href={href}
            className="text-base font-medium leading-6 text-primary-500 hover:text-primary-600 dark:hover:text-primary-400"
            aria-label={`Link to ${title}`}
          >
            demo &rarr;
          </Link>
        )} */}
      </div>
    </div>
  </div>
)

export default Card
