export default function Footer() {
	const year = new Date().getFullYear();

	return (
		<footer className="mt-20 border-t px-4 pb-14 pt-10 text-muted-foreground">
			<div className="mx-auto flex w-full max-w-5xl items-center justify-center text-center">
				<p className="m-0 text-sm">&copy; {year} Graph Web</p>
			</div>
		</footer>
	);
}
